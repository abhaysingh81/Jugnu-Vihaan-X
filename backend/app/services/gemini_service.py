# backend/app/services/gemini_service.py

from google import genai
from google.genai import errors, types
import os
from typing import Dict, List, Any
import json
from datetime import datetime

class GeminiServiceError(Exception):
    """Custom exception for GeminiService errors"""

    status_code = 502


class GeminiBillingError(GeminiServiceError):
    """The configured Gemini project cannot generate content until billing is resolved."""

    status_code = 503

class GeminiService:
    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("Gemini API key is required")
        
        self.client = genai.Client(
            api_key=api_key, http_options=types.HttpOptions(timeout=15000)
        )
        self.model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")

    def generate_json(self, prompt: str) -> Dict[str, Any]:
        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json", max_output_tokens=4096
                ),
            )
            analysis = json.loads(response.text or "null")
            if not isinstance(analysis, dict):
                raise ValueError("Expected a JSON object")
            return analysis
        except errors.APIError as error:
            if error.code == 402:
                raise GeminiBillingError("Gemini generation is unavailable because the project's API credits are depleted.") from error
            raise GeminiServiceError("The AI service is unavailable or returned invalid data.") from error
        except Exception as error:
            raise GeminiServiceError("The AI service is unavailable or returned invalid data.") from error

    def analyze_route(self, route_data: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze route context using the configured model."""
        try:
            current_hour = datetime.now().hour
            daylight = route_data["time_of_day"] == "day" or (route_data["time_of_day"] != "night" and 6 <= current_hour < 18)
            time_context = "during daylight hours" if daylight else "during night hours"

            if "comparison" in route_data:
                return self.generate_json(
                    f"Explain an advisory walking-route comparison {time_context} in two short recommendations. "
                    "Use the supplied suggested route number and scores as fixed facts. A higher score means fewer "
                    "modelled drawbacks. Penalties are points for detour distance, walking time, terrain and weather. "
                    "Explain the largest differences or the limitation if only one route exists. Do not claim any route "
                    "is safe or invent street lighting, traffic, crowds, incident statistics or nearby services. "
                    'Return only a JSON object with a "recommendations" array of plain strings. '
                    + json.dumps(route_data["comparison"])
                )
            
            prompt = f"""
            You are a safety analysis expert. Analyze this walking route {time_context}.
            
            Route Details:
            - Time: {route_data['time_of_day']}
            - Distance: {route_data['distance']}
            - Approximate walking duration: {route_data.get('duration', 'Unknown')}
            
            Considering the current time ({time_context}), provide a comprehensive safety assessment.
            Focus on:
            1. Route characteristics (main vs side streets, visibility)
            2. Area safety statistics and known risk factors
            3. Public transportation and emergency service access
            4. Pedestrian activity and natural surveillance
            5. Environmental factors (lighting, weather impact)
            
            Return a detailed JSON with this exact structure:
            {{
                "safety_score": <number 0-100>,
                "risk_level": <"low"|"medium"|"high">,
                "primary_concerns": [<list of top 3 safety concerns>],
                "recommendations": [<list of 3-5 specific safety tips>],
                "safe_spots": [<list of safe locations along route>],
                "emergency_resources": [<list of nearby emergency services>],
                "safer_alternatives": [<optional safer route suggestions>],
                "confidence_score": <number 0.0-1.0>
            }}
            
            The information above is limited. Do not invent local incidents, lighting,
            operating hours, named places, or emergency service details. Leave lists of
            locations empty unless locations were supplied. A score reflects general
            context only. Keep confidence low and give practical precautions.
            """
            return self.generate_json(prompt)
            
        except GeminiServiceError:
            raise

    def analyze_area(self, location: Dict[str, float]) -> Dict[str, Any]:
        """Analyze area context at city scale."""
        try:
            current_hour = datetime.now().hour
            time_context = "during daylight hours" if 6 <= current_hour <= 18 else "during night hours"
            
            prompt = f"""
            Analyze the immediate safety of this location {time_context}:
            Approximate area: latitude {float(location['lat']):.1f},
            longitude {float(location['lng']):.1f}. Provide general precautions.
            Do not invent named places, local incidents, or emergency contact information.
            This context does not establish actual current conditions. Keep confidence low.
            
            Provide a detailed safety assessment focusing on:
            1. Area characteristics and safety profile
            2. Current time and environmental conditions
            3. Nearby safe spaces and emergency services
            4. Public transportation access
            5. General safety recommendations
            
            Return analysis as JSON with this exact structure:
            {{
                "area_safety_score": <number 0-100>,
                "risk_level": <"low"|"medium"|"high">,
                "immediate_risks": [<list of current safety concerns>],
                "safe_spaces": [<list of nearby safe locations>],
                "recommended_actions": [<list of immediate safety steps>],
                "emergency_services": [<list of nearby emergency resources>],
                "confidence_score": <number 0.0-1.0>
            }}
            """

            return self.generate_json(prompt)
            
        except GeminiServiceError:
            raise

    def _parse_response(self, text: str) -> Dict[str, Any]:
        """Parse Gemini response and extract JSON."""
        try:
            # Find JSON in response
            start_idx = text.find('{')
            end_idx = text.rfind('}') + 1
            if start_idx != -1 and end_idx != -1:
                json_str = text[start_idx:end_idx]
                return json.loads(json_str)
            return self._get_fallback_analysis()
        except json.JSONDecodeError:
            return self._get_fallback_analysis()

    def _get_fallback_analysis(self) -> Dict[str, Any]:
        """Provide fallback route analysis if AI fails."""
        return {
            "safety_score": 70,
            "risk_level": "medium",
            "primary_concerns": [
                "Limited visibility in some areas",
                "Variable pedestrian traffic",
                "Weather conditions may affect safety"
            ],
            "recommendations": [
                "Stay on well-lit main streets",
                "Share location with trusted contacts",
                "Keep emergency contacts readily available",
                "Use public transportation when possible"
            ],
            "safe_spots": [
                "24/7 convenience stores",
                "Police stations",
                "Hospital emergency rooms"
            ],
            "emergency_resources": [
                "Local police station",
                "Emergency room",
                "24/7 pharmacy"
            ],
            "safer_alternatives": [
                "Consider using main streets",
                "Use well-lit routes"
            ],
            "confidence_score": 0.8
        }

    def _get_fallback_area_analysis(self) -> Dict[str, Any]:
        """Provide fallback area analysis if AI fails."""
        return {
            "area_safety_score": 65,
            "risk_level": "medium",
            "immediate_risks": [
                "Limited lighting conditions",
                "Low pedestrian activity",
                "Distance from emergency services"
            ],
            "safe_spaces": [
                "Local businesses",
                "Public buildings",
                "Transportation hubs"
            ],
            "recommended_actions": [
                "Stay in well-lit areas",
                "Keep to main pathways",
                "Stay aware of surroundings",
                "Have emergency contacts ready"
            ],
            "emergency_services": [
                "Police station within 2km",
                "Hospital within 3km",
                "24/7 pharmacy nearby"
            ],
            "confidence_score": 0.7
        }
