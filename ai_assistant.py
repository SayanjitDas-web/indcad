"""
IndCAD AI Assistant
Gemini-powered design assistant and shape generator.
"""
import os
import json
import time
import google.generativeai as genai
from collections import deque
from dotenv import load_dotenv

class AiAssistant:
    """Handles interaction with Gemini AI for drawing assistance."""
    
    def __init__(self, api_key=None):
        load_dotenv()
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY")
        if self.api_key:
            genai.configure(api_key=self.api_key)
        
        # Rate limiting: 5 requests per minute
        self.request_times = deque(maxlen=5)
        self.model = genai.GenerativeModel('gemini-2.5-flash')
        self.chat = None

    def set_api_key(self, api_key, persist=False):
        """Update the API key dynamically and optionally persist it."""
        self.api_key = api_key
        if self.api_key:
            genai.configure(api_key=self.api_key)
            # Reset model/chat to use new key
            self.model = genai.GenerativeModel('gemini-2.5-flash')
            self.chat = None
            
            if persist:
                try:
                    # Update .env file
                    env_path = os.path.join(os.getcwd(), '.env')
                    lines = []
                    if os.path.exists(env_path):
                        with open(env_path, 'r') as f:
                            lines = f.readlines()
                    
                    # Update or add GEMINI_API_KEY
                    found = False
                    new_line = f"GEMINI_API_KEY={api_key}\n"
                    for i, line in enumerate(lines):
                        if line.startswith('GEMINI_API_KEY='):
                            lines[i] = new_line
                            found = True
                            break
                    if not found:
                        lines.append(new_line)
                    
                    with open(env_path, 'w') as f:
                        f.writelines(lines)
                except Exception as e:
                    print(f"Failed to persist API key: {e}")
        return True

    def get_api_key(self, masked=True):
        """Get the current API key, masked for security by default."""
        if not self.api_key: return ""
        if not masked: return self.api_key
        if len(self.api_key) <= 8: return "*" * len(self.api_key)
        return self.api_key[:4] + "*" * (len(self.api_key) - 8) + self.api_key[-4:]

    def _check_rate_limit(self):
        """Returns True if request is allowed, False otherwise."""
        now = time.time()
        # Remove timestamps older than 60 seconds
        while self.request_times and now - self.request_times[0] > 60:
            self.request_times.popleft()
        
        if len(self.request_times) < 5:
            self.request_times.append(now)
            return True
        return False

    def get_chat_response(self, prompt, project_context):
        """Get assistant advice based on current project context."""
        if not self.api_key:
            return "Error: Gemini API key not found. Please set it in the AI Assistant settings (gear icon)."
        
        if not self._check_rate_limit():
            return "Error: Rate limit exceeded (5 requests per minute). Please wait a moment."

        system_instruction = f"""
        You are IndCAD AI, a professional CAD drawing assistant.
        Current Project Context: {json.dumps(project_context)}
        
        Capabilities:
        1. Design Advice: Provide concise, professional CAD/architecture advice.
        2. Drawing Content: If you want to DRAW something, output a JSON block with "draw" key.
        3. Exporting: Mention that the user can click the "Export DXF" button to save their design directly to their machine as a professional CAD file. You can suggest this when a design is completed.
        
        Supported shape types: line, rectangle, circle, arc, polyline, text.
        Coordinates: Use the provided context to align with existing shapes.
        Format: Always prioritize a helpful text response. If drawing, strictly follow the JSON format above.
        """
        
        if not self.chat:
            self.chat = self.model.start_chat(history=[])
            # Lead with system instruction
            full_prompt = f"{system_instruction}\n\nUser: {prompt}"
        else:
            full_prompt = prompt

        try:
            response = self.chat.send_message(full_prompt)
            # Simple extractor for mixed text/json
            text = response.text
            return self._parse_mixed_response(text)
        except Exception as e:
            return {"text": f"Error: {str(e)}", "draw": []}

    def _parse_mixed_response(self, raw_text):
        """Extract text and drawing commands from AI response."""
        result = {"text": raw_text, "draw": []}
        
        # Look for code blocks
        if "```json" in raw_text:
            try:
                parts = raw_text.split("```json")
                for part in parts[1:]:
                    json_str = part.split("```")[0].strip()
                    data = json.loads(json_str)
                    if isinstance(data, dict):
                        if "text" in data: result["text"] = str(data["text"])
                        if "draw" in data: result["draw"] = data["draw"]
                    elif isinstance(data, list):
                        # Backward compat for simple arrays
                        result["draw"] = data
            except:
                pass # Fallback to raw text if JSON is malformed
        
        return result

    def generate_starting_drawing(self, name, description):
        """Generate a list of IndCAD shapes for a new project starting point."""
        if not self.api_key:
            return None
        
        if not self._check_rate_limit():
            return None

        prompt = f"""
        Generate a professional CAD starting drawing for a project named '{name}'.
        Project Description: {description}
        
        Output ONLY a valid JSON array of IndCAD shapes. Do not include any other text or markdown blocks.
        Supported shape types and required fields:
        - line: x1, y1, x2, y2, color
        - rectangle: x, y, width, height, color
        - circle: cx, cy, radius, color
        - arc: cx, cy, radius, startAngle, endAngle, color
        - polyline: points (array of [x,y]), closed (bool), color
        - text: x, y, content, fontSize, color
        
        Keep it simple but professional (e.g., if it's a house, draw a few walls and a door).
        Ensure coordinates are centered around 0,0.
        """

        try:
            response = self.model.generate_content(prompt)
            # Find JSON in response (Gemini sometimes adds ```json blocks)
            text = response.text.strip()
            if "```" in text:
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            
            return json.loads(text)
        except Exception as e:
            print(f"Generation error: {e}")
            return None
