import os
import json
import time
from google import genai
from openai import OpenAI
from collections import deque
from dotenv import load_dotenv

class AiAssistant:
    """Handles interaction with Gemini AI and OpenRouter fallback."""
    
    def __init__(self, gemini_key=None, openrouter_key=None):
        load_dotenv()
        self.gemini_key = gemini_key or os.environ.get("GEMINI_API_KEY")
        self.openrouter_key = openrouter_key or os.environ.get("OPENROUTER_API_KEY")
        self.api_key = self.gemini_key # Backward compatibility
        
        self.client = None
        if self.gemini_key:
            self.client = genai.Client(api_key=self.gemini_key)
        
        self.or_client = None
        if self.openrouter_key:
            self.or_client = OpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=self.openrouter_key,
                default_headers={
                    "HTTP-Referer": "https://indcad.app",
                    "X-Title": "IndCAD",
                }
            )
        
        # Rate limiting: 5 requests per minute for Gemini
        self.request_times = deque(maxlen=5)
        self.chat = None
        self.model_name = 'gemini-2.5-flash'

    def set_api_key(self, api_key, persist=False, provider='gemini'):
        """Update the API key dynamically and optionally persist it."""
        if provider == 'gemini':
            self.gemini_key = api_key
            self.api_key = api_key
            if self.gemini_key:
                self.client = genai.Client(api_key=self.gemini_key)
                self.chat = None
        else:
            self.openrouter_key = api_key
            if self.openrouter_key:
                self.or_client = OpenAI(
                    base_url="https://openrouter.ai/api/v1",
                    api_key=self.openrouter_key,
                    default_headers={
                        "HTTP-Referer": "https://indcad.app",
                        "X-Title": "IndCAD",
                    }
                )
            
        if persist:
            try:
                env_path = os.path.join(os.getcwd(), '.env')
                lines = []
                if os.path.exists(env_path):
                    with open(env_path, 'r') as f:
                        lines = f.readlines()
                
                key_name = "GEMINI_API_KEY" if provider == 'gemini' else "OPENROUTER_API_KEY"
                new_line = f"{key_name}={api_key}\n"
                found = False
                for i, line in enumerate(lines):
                    if line.startswith(f'{key_name}='):
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

    def get_api_key(self, masked=True, provider='gemini'):
        """Get the current API key, masked for security."""
        key = self.gemini_key if provider == 'gemini' else self.openrouter_key
        if not key: return ""
        if not masked: return key
        if len(key) <= 8: return "*" * len(key)
        return key[:4] + "*" * (len(key) - 8) + key[-4:]

    def _check_gemini_rate_limit(self):
        """Returns True if Gemini request is allowed."""
        now = time.time()
        while self.request_times and now - self.request_times[0] > 60:
            self.request_times.popleft()
        
        if len(self.request_times) < 5:
            self.request_times.append(now)
            return True
        return False

    def get_chat_response(self, prompt, project_context):
        """Get assistant advice with fallback support."""
        if not self.gemini_key and not self.openrouter_key:
            return "Error: No AI API keys found. Please set them in settings."

        system_instruction = f"""
        You are IndCAD AI, a professional CAD drawing assistant.
        Current Project Context: {json.dumps(project_context)}
        
        Capabilities:
        1. Design Advice: Provide concise, professional CAD/architecture advice.
        2. Drawing Content: If you want to DRAW something, output a JSON block with "draw" key containing an array of shapes.
        3. Exporting: Mention that the user can click the "Export DXF" button to save their design directly.
        
        CRITICAL: Layer and Color Awareness:
        - The current active layer is '{project_context.get('activeLayer', 'layer-0')}' with color '{project_context.get('activeLayerColor', '#ffffff')}'.
        - You SHOULD use this color for your drawings by default unless the user asks for something else.
        - Ensure all shapes have a 'color' and 'layer' field. Use the activeLayer ID for the 'layer' field.
        
        Shape Field Names (Schema):
        - line: x1, y1, x2, y2, color, layer
        - rectangle: x, y, width, height, color, layer
        - circle: cx, cy, radius, color, layer
        - arc: cx, cy, radius, startAngle, endAngle, color, layer
        - polyline: points (array of [x,y]), closed (bool), color, layer
        - text: x, y, content, fontSize, color, layer
        
        Units & Measurements:
        The project uses dynamic CAD units (see 'settings' in context).
        - Architectural/Engineering: 1 unit = 1 inch. (e.g., 5'6" should be treated as 66 units).
        - Decimal/Others: 1 unit = 1 millimeter (or generic unit).
        - Always output pure numbers in JSON. If a user asks for "10 feet", convert to the appropriate numeric value based on the current system.
        
        Coordinates: Center around 0,0 unless the context suggests otherwise.
        Format: Always provide a helpful text response followed by a JSON code block if drawing.
        """

        self._current_context = project_context # Temp store for normalization

        # Try Gemini First
        if self.gemini_key and self.client and self._check_gemini_rate_limit():
            try:
                if not self.chat:
                    self.chat = self.client.chats.create(
                        model=self.model_name,
                        config={'system_instruction': system_instruction}
                    )
                
                response = self.chat.send_message(prompt)
                return self._parse_mixed_response(response.text)
            except Exception as e:
                print(f"Gemini error, trying fallback if available: {e}")
                if not self.openrouter_key:
                    return {"text": f"Gemini Error (and no fallback): {str(e)}", "draw": []}

        # Fallback to OpenRouter
        if self.openrouter_key:
            return self._openrouter_chat(prompt, system_instruction)
        
        return {"text": "Error: Gemini rate limit reached and no OpenRouter key provided.", "draw": []}

    def _openrouter_chat(self, prompt, system_instruction):
        """Fallback chat using OpenRouter (Llama 3.1) - Using OpenAI SDK."""
        try:
            if not self.or_client:
                return {"text": "Error: OpenRouter client not initialized.", "draw": []}
            
            response = self.or_client.chat.completions.create(
                model="openrouter/free",
                messages=[
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": prompt}
                ]
            )
            
            text = response.choices[0].message.content
            return self._parse_mixed_response(text)
        except Exception as e:
            return {"text": f"Fallback Error: {str(e)}", "draw": []}

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
                    
                    shapes = []
                    if isinstance(data, dict):
                        if "text" in data: result["text"] = str(data["text"])
                        if "draw" in data: shapes = data["draw"]
                    elif isinstance(data, list):
                        shapes = data
                        
                    # Normalize shapes
                    for s in shapes:
                        if not isinstance(s, dict): continue
                        ns = self._normalize_shape(s)
                        if ns: result["draw"].append(ns)
            except:
                pass # Fallback to raw text if JSON is malformed
        
        return result

    def _normalize_shape(self, s):
        """Normalize AI-generated shape data to IndCAD format."""
        if 'type' not in s: return None
        stype = s['type'].lower()
        
        ns = {"type": stype}
        
        # Common mapping: color and layer awareness
        ctx = getattr(self, '_current_context', {})
        default_color = ctx.get('activeLayerColor', '#ffffff')
        default_layer = ctx.get('activeLayer', 'layer-0')

        ns['color'] = s.get('color', default_color)
        ns['layer'] = s.get('layer', s.get('layer_id', default_layer))
        
        if stype == 'line':
            ns['x1'] = s.get('x1', 0)
            ns['y1'] = s.get('y1', 0)
            ns['x2'] = s.get('x2', 0)
            ns['y2'] = s.get('y2', 0)
        elif stype == 'rectangle':
            ns['x'] = s.get('x', 0)
            ns['y'] = s.get('y', 0)
            ns['width'] = s.get('width', 10)
            ns['height'] = s.get('height', 10)
        elif stype == 'circle' or stype == 'arc':
            # Handle AI "center": [x, y] or "cx", "cy"
            center = s.get('center')
            if isinstance(center, list) and len(center) >= 2:
                ns['cx'], ns['cy'] = center[0], center[1]
            else:
                ns['cx'] = s.get('cx', s.get('x', 0))
                ns['cy'] = s.get('cy', s.get('y', 0))
            
            ns['radius'] = s.get('radius', 5)
            if stype == 'arc':
                ns['startAngle'] = s.get('startAngle', 0)
                ns['endAngle'] = s.get('endAngle', 90)
        elif stype == 'polyline':
            ns['points'] = s.get('points', [])
            ns['closed'] = s.get('closed', False)
        elif stype == 'text':
            ns['x'] = s.get('x', 0)
            ns['y'] = s.get('y', 0)
            ns['content'] = s.get('content', 'AI Text')
            ns['fontSize'] = s.get('fontSize', 14)
        else:
            return None # Unsupported type
            
        return ns

    def generate_starting_drawing(self, name, description):
        """Generate a list of IndCAD shapes with fallback support."""
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

        # Try Gemini
        if self.gemini_key and self.client and self._check_gemini_rate_limit():
            try:
                response = self.client.models.generate_content(
                    model=self.model_name,
                    contents=prompt
                )
                return self._parse_generation_text(response.text)
            except Exception as e:
                print(f"Gemini generation error: {e}")

        # Try OpenRouter
        if self.openrouter_key and self.or_client:
            try:
                response = self.or_client.chat.completions.create(
                    model="openrouter/free",
                    messages=[{"role": "user", "content": prompt}]
                )
                text = response.choices[0].message.content
                return self._parse_generation_text(text)
            except Exception as e:
                print(f"OpenRouter generation error: {e}")

        return None

    def _parse_generation_text(self, text):
        """Parse JSON from AI generation text."""
        text = text.strip()
        if "```" in text:
            parts = text.split("```")
            for part in parts:
                if part.strip().startswith("[") or part.strip().startswith("json"):
                    text = part.strip()
                    if text.startswith("json"): text = text[4:].strip()
                    break
        try:
            return json.loads(text)
        except:
            return None
