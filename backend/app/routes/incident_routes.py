import base64
import binascii
import json
import math
import os
import re
import uuid
from datetime import timedelta

import requests
from flask import Blueprint, g, jsonify, request
from sqlalchemy.exc import IntegrityError

from ..models import ContactNotification, DemoContactCall, EmergencyContact, SafetyIncident, User, db
from .account_routes import payload, require_account, utc_now

incident_bp = Blueprint("incidents", __name__)
incident_bp.before_request(require_account)

TWILIO_CALL_ACTIVE = {"queued", "initiated", "ringing", "in-progress"}
TWILIO_CALL_FINAL = {"completed", "busy", "failed", "no-answer", "canceled"}
TWILIO_CALL_STATUSES = TWILIO_CALL_ACTIVE | TWILIO_CALL_FINAL
TWILIO_TRIAL_VOICE_TEMPLATE = "https://webhooks.twilio.com/v1/Voice/Template/voice_text_to_speech"


def public_incident(row, call_status=None):
    result = {"id": row.client_id, "trigger": row.trigger, "state": row.state, "created": row.created_ms, "version": row.version}
    if call_status:
        result.update(demo=True, callStatus=call_status)
    if row.lat is not None:
        result["location"] = {"lat": row.lat, "lng": row.lng, "timestamp": row.position_ms}
    return result


def coordinates(data):
    point = data.get("location")
    if point is None:
        return {}
    lat, lng, timestamp = point["lat"], point["lng"], point["timestamp"]
    if not all(type(number) in (int, float) and math.isfinite(number) for number in (lat, lng)):
        raise ValueError
    if not -90 <= lat <= 90 or not -180 <= lng <= 180 or type(timestamp) is not int or not 0 <= timestamp < 10**14:
        raise ValueError
    return {"lat": lat, "lng": lng, "position_ms": timestamp}


@incident_bp.get("")
def history():
    entries = SafetyIncident.query.filter_by(user_id=g.user_id).order_by(SafetyIncident.created_ms.desc()).limit(100).all()
    call_status = dict(db.session.query(DemoContactCall.incident_id, DemoContactCall.status)
                       .filter(DemoContactCall.user_id == g.user_id,
                               DemoContactCall.incident_id.in_([row.client_id for row in entries])).all())
    return jsonify(incidents=[public_incident(row, call_status.get(row.client_id)) for row in entries])


@incident_bp.post("")
def sync():
    data = payload()
    if data.get("owner") != g.user_id:
        return jsonify(error="Incident belongs to a different account."), 403
    try:
        client_id = str(uuid.UUID(data["id"]))
        trigger, state, created, version = (data[key] for key in ("trigger", "state", "created", "version"))
        if trigger not in ("manual", "audio") or state not in ("pending", "active", "resolved", "interrupted"):
            raise ValueError
        if type(created) is not int or type(version) is not int or not 0 <= created < 10**14 or not 0 < version < 100000:
            raise ValueError
        point = coordinates(data)
    except (ValueError, TypeError, KeyError, AttributeError, OverflowError):
        return jsonify(error="Invalid incident."), 400

    identity = {"user_id": g.user_id, "client_id": client_id}
    changes = {SafetyIncident.state: state, SafetyIncident.version: version,
               **{getattr(SafetyIncident, key): value for key, value in point.items()}}
    query = SafetyIncident.query.filter_by(**identity).filter(SafetyIncident.version < version)
    updated = query.update(changes, synchronize_session=False)
    if not updated and not db.session.get(SafetyIncident, (g.user_id, client_id)):
        db.session.add(SafetyIncident(**identity, **point, trigger=trigger, state=state, created_ms=created, version=version))
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        query.update(changes, synchronize_session=False)
        db.session.commit()
    return jsonify(ok=True)


def demo_contact_target():
    user = db.session.get(User, g.user_id)
    target = os.getenv("JUGNU_DEMO_CONTACT", "").strip()
    if user and user.email == os.getenv("JUGNU_DEMO_EMAIL", "").strip().lower() and re.fullmatch(r"\+91[6-9]\d{9}", target):
        return target
    return None


def twilio_voice_config():
    sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    auth = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    caller = os.getenv("TWILIO_VOICE_FROM", "").strip()
    if (not re.fullmatch(r"AC[0-9a-fA-F]{32}", sid) or not auth
            or not re.fullmatch(r"\+[1-9]\d{7,14}", caller) or caller.startswith("+91")):
        return None
    return f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Calls", (sid, auth), caller


@incident_bp.post("/demo-call")
def demo_call():
    target = demo_contact_target()
    if not target:
        return jsonify(error="Demo calling is unavailable for this account."), 403
    data = payload()
    try:
        incident_id = str(uuid.UUID(data["id"]))
    except (ValueError, TypeError, KeyError, AttributeError):
        return jsonify(error="Invalid incident ID."), 400

    incident = db.session.get(SafetyIncident, (g.user_id, incident_id))
    if not incident or not (incident.state == "active" or (incident.state == "pending" and incident.trigger == "audio")):
        return jsonify(error="An active demo SOS or pending sound alert is required."), 409
    if not EmergencyContact.query.filter_by(user_id=g.user_id, phone=target).first():
        return jsonify(error="The configured demo contact is missing."), 409

    existing = db.session.get(DemoContactCall, (g.user_id, incident_id))
    if existing:
        return jsonify(status=existing.status)
    voice = twilio_voice_config()
    if not voice:
        return jsonify(status="unconfigured")
    calls_url, credentials, caller = voice

    recent_cutoff = utc_now() - timedelta(seconds=60)
    if DemoContactCall.query.filter(DemoContactCall.user_id == g.user_id, DemoContactCall.created_at > recent_cutoff).first():
        return jsonify(status="cooldown")
    call = DemoContactCall(user_id=g.user_id, incident_id=incident_id, status="submitting", created_at=utc_now())
    db.session.add(call)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        existing = db.session.get(DemoContactCall, (g.user_id, incident_id))
        return jsonify(status=existing.status if existing else "unconfirmed")

    try:
        call_data = {"To": target, "From": caller}
        if os.getenv("TWILIO_VOICE_MODE", "standard").strip().lower() == "trial":
            call_data["Url"] = TWILIO_TRIAL_VOICE_TEMPLATE
        else:
            call_data.update(
                Timeout=25,
                Twiml=("<Response><Say>This is a Jugnu safety demo. A safety alert was triggered. "
                       "Please check in with the person running the demo.</Say></Response>"),
            )
        response = requests.post(
            f"{calls_url}.json",
            auth=credentials,
            data=call_data,
            timeout=(3, 7),
        )
        response.raise_for_status()
        result = response.json()
        provider_sid = result["sid"]
        if not re.fullmatch(r"CA[0-9a-fA-F]{32}", provider_sid):
            raise ValueError("Invalid provider call ID")
        call.provider_sid = provider_sid
        provider_status = result.get("status")
        call.status = provider_status if provider_status in TWILIO_CALL_STATUSES else "submitted"
    except requests.HTTPError as error:
        call.status = "unconfirmed"
        if error.response is not None and 400 <= error.response.status_code < 500:
            call.status = "rejected"
            try:
                details = error.response.json()
                code = details.get("code")
                if code == 21215:
                    call.status = "geo-blocked"
                elif code == 21210:
                    call.status = "caller-unverified"
                elif code == 0 and "trial accounts" in str(details.get("message", "")).lower():
                    call.status = "trial-restricted"
            except (ValueError, AttributeError):
                pass
    except (requests.RequestException, ValueError, KeyError, TypeError):
        call.status = "unconfirmed"
    db.session.commit()
    return jsonify(status=call.status)


@incident_bp.get("/demo-call/<uuid:incident_id>")
def demo_call_status(incident_id):
    if not demo_contact_target():
        return jsonify(error="Demo calling is unavailable for this account."), 403
    call = db.session.get(DemoContactCall, (g.user_id, str(incident_id)))
    if not call:
        return jsonify(error="Demo call not found."), 404
    voice = twilio_voice_config()
    if voice and call.status not in TWILIO_CALL_FINAL and call.provider_sid:
        calls_url, credentials, _ = voice
        try:
            response = requests.get(f"{calls_url}/{call.provider_sid}.json", auth=credentials, timeout=(3, 4))
            response.raise_for_status()
            status = response.json().get("status")
            if status in TWILIO_CALL_STATUSES and status != call.status:
                DemoContactCall.query.filter_by(user_id=g.user_id, incident_id=str(incident_id), status=call.status).update(
                    {"status": status}, synchronize_session=False
                )
                db.session.commit()
        except (requests.RequestException, ValueError, TypeError, AttributeError):
            pass
    return jsonify(status=call.status)


@incident_bp.post("/assessment")
def assessment():
    data = payload()
    row = SafetyIncident.query.filter_by(user_id=g.user_id, client_id=data.get("id") if isinstance(data.get("id"), str) else "").first()
    if not row:
        return jsonify(error="Incident not found. Wait for the incident to sync and try again."), 404
    user = db.session.get(User, g.user_id)
    demo = bool(user and user.email == os.getenv("JUGNU_DEMO_EMAIL", "").strip().lower())
    frame = data.get("frame")
    followup = data.get("followup") if demo and row.trigger == "audio" else None
    for image_data in (frame, followup):
        if image_data is None:
            continue
        try:
            if not isinstance(image_data, str) or not image_data.startswith("data:image/jpeg;base64,") or len(image_data) > 95000:
                raise ValueError
            image = base64.b64decode(image_data.split(",", 1)[1], validate=True)
            if not image.startswith(b"\xff\xd8") or not image.endswith(b"\xff\xd9"):
                raise ValueError
        except (ValueError, binascii.Error):
            return jsonify(error="Use a compressed JPEG from your recording."), 400

    api_key = os.getenv("MARITIME_API_KEY", "")
    agent_id = os.getenv("MARITIME_AGENT_ID", "")
    token = os.getenv("JUGNU_AGENT_TOKEN", "")
    if not api_key or not token or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", agent_id):
        return jsonify(error="AI assessment is unavailable. The incident is still recorded."), 503
    observation = "Manual SOS" if row.trigger == "manual" else "The local audio detector found a possible scream"
    try:
        message = {"token": token, "observation": observation, "frame": frame}
        if followup:
            message["followup"] = followup
        response = requests.post(f"https://api.maritime.sh/api/agents/{agent_id}/chat",
                                 headers={"Authorization": f"Bearer {api_key}"},
                                 json={"message": json.dumps(message)}, timeout=(4, 28))
        response.raise_for_status()
        reply = json.loads(response.json()["response"])
        if reply.get("error") == "missing_provider_key":
            return jsonify(error="AI assessment is unavailable until the model provider is connected in Prune."), 503
        summary = reply.get("summary")
        if not isinstance(summary, str) or not summary.strip():
            raise ValueError("Missing scene summary")
        benign = bool(frame and followup and frame != followup and reply.get("disposition") == "clear_benign")
        return jsonify(summary=summary[:1000], benign=benign, prune_receipt=reply.get("prune_receipt") is True)
    except (requests.RequestException, ValueError, KeyError, TypeError, AttributeError):
        return jsonify(error="Scene assessment is unavailable. The incident remains independent."), 502


@incident_bp.post("/notify")
def notify_contacts():
    data = payload()
    incident_id = data.get("id")
    if not isinstance(incident_id, str) or data.get("confirmed") is not True:
        return jsonify(error="Confirm that your contacts agreed to receive this alert."), 400
    incident = db.session.get(SafetyIncident, (g.user_id, incident_id))
    if not incident or incident.state != "active":
        return jsonify(error="An active, synced SOS is required."), 409
    sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    auth = os.getenv("TWILIO_AUTH_TOKEN", "")
    service = os.getenv("TWILIO_MESSAGING_SERVICE_SID", "")
    if not re.fullmatch(r"AC[0-9a-fA-F]{32}", sid) or not auth or not re.fullmatch(r"MG[0-9a-fA-F]{32}", service):
        return jsonify(error="Contact SMS is unavailable. You can still share your location manually."), 503

    contacts = EmergencyContact.query.filter_by(user_id=g.user_id).order_by(EmergencyContact.id).limit(5).all()
    if not contacts:
        return jsonify(error="Add an emergency contact first."), 400
    body = "Jugnu SOS: One of your trusted contacts may need help. Please contact them."
    if incident.lat is not None and data.get("share_location") is True:
        body += f" Last known location: https://www.google.com/maps/search/?api=1&query={incident.lat},{incident.lng}"
    endpoint = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
    results = []
    for contact in contacts:
        key = (g.user_id, incident_id, contact.id)
        notification = db.session.get(ContactNotification, key)
        if notification is None:
            notification = ContactNotification(user_id=key[0], incident_id=key[1], contact_id=key[2], status="submitting")
            db.session.add(notification)
            try:
                db.session.commit()
            except IntegrityError:
                db.session.rollback()
                notification = db.session.get(ContactNotification, key)
            else:
                try:
                    response = requests.post(endpoint, auth=(sid, auth), data={
                        "To": contact.phone, "MessagingServiceSid": service, "Body": body
                    }, timeout=(3, 4))
                    response.raise_for_status()
                    result = response.json()
                    provider_sid = result["sid"]
                    if not re.fullmatch(r"SM[0-9a-fA-F]{32}", provider_sid):
                        raise ValueError("Invalid provider message ID")
                    notification.provider_sid = provider_sid
                    notification.status = "submitted"
                except requests.HTTPError:
                    notification.status = "rejected"
                except (requests.RequestException, ValueError, TypeError, KeyError):
                    notification.status = "unconfirmed"
                db.session.commit()
        results.append({"contact": contact.name, "status": notification.status if notification else "unconfirmed"})
    return jsonify(results=results)
