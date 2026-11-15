import hashlib
import os
import re
import secrets
from datetime import datetime, timedelta, timezone

from flask import Blueprint, current_app, g, jsonify, request
from sqlalchemy.exc import IntegrityError
from werkzeug.security import check_password_hash, generate_password_hash

from ..models import Account, AccountSession, AuthAttempts, CommunityReport, EmergencyContact, User, db

account_bp = Blueprint("account", __name__)
COOKIE = "jugnu_session"
PASSWORD_HASH = "scrypt:32768:8:1"
SESSION_SECONDS = 60 * 60 * 24 * 7
EMAIL = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
PHONE = re.compile(r"\+[1-9]\d{7,14}")


def utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def payload():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def trimmed(data, key, limit=120):
    value = data.get(key)
    return value.strip() if isinstance(value, str) and len(value) <= limit else ""


def token_digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def serialize_contact(contact):
    return {key: getattr(contact, key) for key in ("id", "name", "phone", "email", "relationship", "is_primary")}


def profile(user, account):
    demo_email = os.getenv("JUGNU_DEMO_EMAIL", "").strip().lower()
    return {"id": user.id, "name": user.name, "email": user.email, "phone": user.phone,
            "has_pin": bool(account.pin_hash), "demo": bool(demo_email and user.email == demo_email)}


def user_session():
    token = request.cookies.get(COOKIE, "")
    if not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
        return None
    row = db.session.get(AccountSession, token_digest(token))
    return row if row and row.expires_at > utc_now() else None


def require_account():
    row = user_session()
    if row is None:
        return jsonify(error="Sign in to continue."), 401
    g.account = db.session.get(Account, row.user_id)
    g.user_id = row.user_id


def allow_auth_attempt(identifier, limit):
    key = token_digest(identifier)
    now = utc_now()
    reset = now + timedelta(minutes=15)
    row = db.session.get(AuthAttempts, key)
    if row is None:
        db.session.add(AuthAttempts(key=key, count=1, resets_at=reset))
        try:
            db.session.commit()
            return True
        except IntegrityError:
            db.session.rollback()
    AuthAttempts.query.filter_by(key=key).filter(AuthAttempts.resets_at <= now).update(
        {"count": 0, "resets_at": reset}, synchronize_session=False
    )
    count = AuthAttempts.query.filter_by(key=key).filter(AuthAttempts.count < limit).update(
        {AuthAttempts.count: AuthAttempts.count + 1}, synchronize_session=False
    )
    db.session.commit()
    return count == 1


def client_address():
    if request.remote_addr in {"127.0.0.1", "::1"}:
        return request.headers.get("X-Jugnu-Client-Address", request.remote_addr)[:80]
    return request.remote_addr or "unknown"


def begin_session(user, account, status):
    old = user_session()
    if old:
        db.session.delete(old)
    AccountSession.query.filter(AccountSession.expires_at <= utc_now()).delete(synchronize_session=False)
    token = secrets.token_urlsafe(32)
    db.session.add(AccountSession(token_hash=token_digest(token), user_id=user.id, expires_at=utc_now() + timedelta(seconds=SESSION_SECONDS)))
    db.session.commit()
    response = jsonify(user=profile(user, account))
    response.set_cookie(COOKIE, token, max_age=SESSION_SECONDS, httponly=True, secure=current_app.config["SESSION_COOKIE_SECURE"], samesite="Lax", path="/")
    return response, status


def contact_fields(data):
    name = trimmed(data, "name")
    phone = re.sub(r"[ ()-]", "", trimmed(data, "phone", 28))
    email = trimmed(data, "email")
    relationship = trimmed(data, "relationship", 50)
    if not name or not PHONE.fullmatch(phone) or (email and not EMAIL.fullmatch(email)):
        raise ValueError("Enter a name and a phone number with country code, such as +919876543210.")
    return {"name": name, "phone": phone, "email": email or None, "relationship": relationship or None}


@account_bp.post("/signup")
def signup():
    data = payload()
    email = trimmed(data, "email").lower()
    name = trimmed(data, "name")
    phone = re.sub(r"[ ()-]", "", trimmed(data, "phone", 28))
    password, pin = data.get("password"), data.get("pin")
    if not EMAIL.fullmatch(email) or not name or not PHONE.fullmatch(phone):
        return jsonify(error="Enter your name, email and phone number with country code."), 400
    if not isinstance(password, str) or not 12 <= len(password) <= 128:
        return jsonify(error="Use a password between 12 and 128 characters."), 400
    if not isinstance(pin, str) or not re.fullmatch(r"[0-9]{4}", pin):
        return jsonify(error="Choose a four-digit SOS passcode."), 400
    try:
        contact = contact_fields(data["contact"]) if isinstance(data.get("contact"), dict) else None
    except ValueError as error:
        return jsonify(error=str(error)), 400
    if not allow_auth_attempt("signup:" + client_address(), 15):
        return jsonify(error="Too many signup attempts. Try again in 15 minutes."), 429
    try:
        user = User(email=email, name=name, phone=phone)
        db.session.add(user)
        db.session.flush()
        account = Account(user_id=user.id, password_hash=generate_password_hash(password, method=PASSWORD_HASH),
                          pin_hash=generate_password_hash(pin, method=PASSWORD_HASH))
        db.session.add(account)
        db.session.flush()
        if contact:
            db.session.add(EmergencyContact(user_id=user.id, is_primary=True, **contact))
        return begin_session(user, account, 201)
    except IntegrityError:
        db.session.rollback()
        return jsonify(error="That email already has an account."), 409


@account_bp.post("/login")
def login():
    data = payload()
    email, password = trimmed(data, "email").lower(), data.get("password")
    if not isinstance(password, str) or not 1 <= len(password) <= 128:
        return jsonify(error="Email or password is incorrect."), 401
    if not allow_auth_attempt("login-ip:" + client_address(), 45) or not allow_auth_attempt("login-email:" + email, 10):
        return jsonify(error="Too many sign-in attempts. Try again in 15 minutes."), 429
    user = User.query.filter_by(email=email).first()
    account = db.session.get(Account, user.id) if user else None
    stored = account.password_hash if account else current_app.extensions["dummy_password_hash"]
    if not check_password_hash(stored, password) or not account:
        return jsonify(error="Email or password is incorrect."), 401
    return begin_session(user, account, 200)


@account_bp.post("/logout")
def logout():
    row = user_session()
    if row:
        db.session.delete(row)
        db.session.commit()
    response = jsonify(ok=True)
    response.delete_cookie(COOKIE, secure=current_app.config["SESSION_COOKIE_SECURE"], httponly=True, samesite="Lax", path="/")
    return response


@account_bp.route("/me", methods=["GET", "PATCH"])
def me():
    denied = require_account()
    if denied:
        return denied
    user = db.session.get(User, g.user_id)
    if request.method == "PATCH":
        data = payload()
        name = trimmed(data, "name")
        phone = re.sub(r"[ ()-]", "", trimmed(data, "phone", 28))
        if not name or not PHONE.fullmatch(phone):
            return jsonify(error="Enter a name and phone number with country code."), 400
        user.name, user.phone = name, phone
        db.session.commit()
    return jsonify(user=profile(user, g.account))


@account_bp.route("/pin", methods=["POST", "PATCH"])
def pin():
    denied = require_account()
    if denied:
        return denied
    data = payload()
    if request.method == "PATCH":
        password, new_pin = data.get("password"), data.get("pin")
        if not isinstance(password, str) or len(password) > 128 or not check_password_hash(g.account.password_hash, password):
            return jsonify(error="Current password is incorrect."), 403
        if not isinstance(new_pin, str) or not re.fullmatch(r"[0-9]{4}", new_pin):
            return jsonify(error="Choose a four-digit SOS passcode."), 400
        g.account.pin_hash = generate_password_hash(new_pin, method=PASSWORD_HASH)
        g.account.pin_failures = 0
        g.account.pin_locked_until = None
        db.session.commit()
        return jsonify(ok=True)

    value = data.get("pin")
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]{4}", value):
        return jsonify(error="Enter your four-digit SOS passcode."), 400
    now = utc_now()
    account = g.account
    if account.pin_locked_until and account.pin_locked_until > now:
        return jsonify(error="Too many attempts. Try again in a minute."), 429
    if account.pin_locked_until:
        account.pin_locked_until = None
        account.pin_failures = 0
    accepted = check_password_hash(account.pin_hash, value)
    account.pin_failures = 0 if accepted else account.pin_failures + 1
    if account.pin_failures >= 5:
        account.pin_locked_until = now + timedelta(minutes=1)
    db.session.commit()
    return jsonify(ok=True) if accepted else (jsonify(error="Incorrect passcode."), 403)


@account_bp.route("/contacts", defaults={"contact_id": None}, methods=["GET", "POST"])
@account_bp.route("/contacts/<int:contact_id>", methods=["PATCH", "DELETE"])
def contacts(contact_id):
    denied = require_account()
    if denied:
        return denied
    query = EmergencyContact.query.filter_by(user_id=g.user_id)
    if request.method == "GET":
        return jsonify(contacts=[serialize_contact(contact) for contact in query.order_by(EmergencyContact.id)])
    contact = query.filter_by(id=contact_id).first_or_404() if contact_id else None
    if request.method == "DELETE":
        db.session.delete(contact)
        db.session.commit()
        return jsonify(ok=True)
    try:
        fields = contact_fields(payload())
    except ValueError as error:
        return jsonify(error=str(error)), 400
    if contact is None:
        if query.count() >= 20:
            return jsonify(error="You can save up to 20 contacts."), 400
        contact = EmergencyContact(user_id=g.user_id, is_primary=query.first() is None, **fields)
        db.session.add(contact)
    else:
        for key, value in fields.items():
            setattr(contact, key, value)
    db.session.commit()
    return jsonify(contact=serialize_contact(contact)), 201 if request.method == "POST" else 200


@account_bp.route("/reports", methods=["GET", "POST"])
def reports():
    if request.method == "POST":
        denied = require_account()
        if denied:
            return denied
        data = payload()
        issue, area = trimmed(data, "issue"), trimmed(data, "area", 100)
        if not issue or not area:
            return jsonify(error="Enter an issue and an area."), 400
        recent = CommunityReport.query.filter(
            CommunityReport.user_id == g.user_id,
            CommunityReport.created_at > utc_now() - timedelta(hours=1),
        ).count()
        if recent >= 5:
            return jsonify(error="You can post up to five reports per hour."), 429
        db.session.add(CommunityReport(user_id=g.user_id, issue=issue, area=area, created_at=utc_now()))
        db.session.commit()
    rows = CommunityReport.query.order_by(CommunityReport.created_at.desc()).limit(50)
    return jsonify(reports=[
        {"id": item.id, "issue": item.issue, "area": item.area, "created": item.created_at.isoformat() + "Z"}
        for item in rows
    ])
