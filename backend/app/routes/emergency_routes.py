# backend/app/routes/emergency_routes.py

from flask import Blueprint, request, jsonify, current_app, g
from ..models import db, Alert, EmergencyContact
from datetime import datetime
import os
import math
import requests
from flask_cors import cross_origin

emergency_bp = Blueprint('emergency', __name__)

@emergency_bp.route('/alert', methods=['POST'])
def create_alert():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Create new alert
        new_alert = Alert(
            user_id=g.user_id,
            type=data['type'],
            location=str(data['location']),
            description=data.get('description', ''),
            status='active'
        )
        
        db.session.add(new_alert)
        db.session.commit()
        
        return jsonify({
            'status': 'success',
            'alert_id': new_alert.id,
            'message': 'Emergency alert created',
            'contacts_notified': 0,
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@emergency_bp.route('/alerts', methods=['GET'])
def get_alerts():
    try:
        alerts = Alert.query.filter_by(user_id=g.user_id).order_by(Alert.created_at.desc()).all()
        return jsonify({
            'alerts': [{
                'id': alert.id,
                'type': alert.type,
                'location': alert.location,
                'description': alert.description,
                'status': alert.status,
                'created_at': alert.created_at.isoformat(),
                'resolved_at': alert.resolved_at.isoformat() if alert.resolved_at else None
            } for alert in alerts]
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    

@emergency_bp.route('/alert/<int:alert_id>', methods=['PUT'])
def update_alert(alert_id):
    try:
        alert = Alert.query.filter_by(id=alert_id, user_id=g.user_id).first()
        if alert is None:
            return jsonify(error="Alert not found."), 404
        data = request.get_json()
        
        alert.status = data.get('status', alert.status)
        if data.get('status') == 'resolved':
            alert.resolved_at = datetime.now()
        
        db.session.commit()
        
        return jsonify({
            'message': 'Alert updated successfully',
            'alert_id': alert.id,
            'status': alert.status
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@emergency_bp.route('/active-alerts', methods=['GET'])
def get_active_alerts():
    alerts = Alert.query.filter_by(status='active', user_id=g.user_id).order_by(Alert.created_at.desc()).all()
    return jsonify({
        'alerts': [{
            'id': alert.id,
            'type': alert.type,
            'location': alert.location,
            'description': alert.description,
            'created_at': alert.created_at.isoformat(),
            'status': alert.status
        } for alert in alerts]
    })

@emergency_bp.route('/contacts', methods=['GET', 'POST'])
def manage_contacts():
    if request.method == 'GET':
        contacts = EmergencyContact.query.filter_by(user_id=g.user_id).all()
        return jsonify({
            'contacts': [{
                'id': contact.id,
                'name': contact.name,
                'phone': contact.phone,
                'email': contact.email,
                'relationship': contact.relationship,
                'is_primary': contact.is_primary
            } for contact in contacts]
        })
    
    else:  # POST
        try:
            data = request.get_json()
            new_contact = EmergencyContact(
                user_id=g.user_id,
                name=data['name'],
                phone=data['phone'],
                email=data.get('email'),
                relationship=data.get('relationship'),
                is_primary=data.get('is_primary', False)
            )
            
            db.session.add(new_contact)
            db.session.commit()
            
            return jsonify({
                'message': 'Emergency contact added successfully',
                'contact_id': new_contact.id
            }), 201
            
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': str(e)}), 500

@emergency_bp.route('/emergency-resources', methods=['POST'])
def get_emergency_resources():
    data = request.get_json(silent=True)
    location = data.get("location") if isinstance(data, dict) else None
    try:
        lat, lng = float(location["lat"]), float(location["lng"])
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            raise ValueError
    except (TypeError, KeyError, ValueError):
        return jsonify(error="Valid latitude and longitude are required."), 400

    key = os.getenv("GOOGLE_MAPS_SERVER_API_KEY")
    if not key:
        return jsonify(error="Nearby places API is not configured."), 503

    try:
        response = requests.post(
            "https://places.googleapis.com/v1/places:searchNearby",
            headers={
                "X-Goog-Api-Key": key,
                "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.primaryType,places.location",
            },
            json={
                "includedTypes": ["police", "hospital"],
                "maxResultCount": 12,
                "rankPreference": "DISTANCE",
                "locationRestriction": {
                    "circle": {"center": {"latitude": lat, "longitude": lng}, "radius": 3500}
                },
            },
            timeout=8,
        )
        response.raise_for_status()
        places = response.json().get("places", [])
    except (requests.RequestException, ValueError):
        return jsonify(error="Nearby places are temporarily unavailable."), 502

    resources = {"police": [], "hospitals": [], "safe_places": []}
    for place in places:
        coordinates = place.get("location")
        if not coordinates:
            continue
        lat_delta = math.radians(coordinates["latitude"] - lat)
        lng_delta = math.radians(coordinates["longitude"] - lng)
        a = math.sin(lat_delta / 2) ** 2 + (
            math.cos(math.radians(lat))
            * math.cos(math.radians(coordinates["latitude"]))
            * math.sin(lng_delta / 2) ** 2
        )
        distance = 12742 * math.asin(math.sqrt(min(a, 1)))
        category = {"police": "police", "hospital": "hospitals"}.get(
            place.get("primaryType"), "safe_places"
        )
        resources[category].append({
            "name": place.get("displayName", {}).get("text", ""),
            "address": place.get("formattedAddress", ""),
            "distance": f"{distance:.1f} km away",
            "lat": coordinates["latitude"],
            "lng": coordinates["longitude"],
        })
    return jsonify(resources)
