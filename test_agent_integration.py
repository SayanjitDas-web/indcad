"""Quick integration test for CADDesignerAgent + HTMLCADKernel."""
from cad_designer_agent import CADDesignerAgent, HTML_DESIGN_PROMPT
from html_cad_kernel import HTMLCADKernel

# Stub AI assistant
class StubAI:
    def get_chat_response(self, prompt, context):
        return {'text': 'test response', 'draw': []}

agent = CADDesignerAgent(StubAI())

# Test 1: Direct HTML/SVG conversion
svg = '<svg viewBox="0 0 100 100"><rect x="10" y="10" width="50" height="30" stroke="#ff0000" fill="none"/><circle cx="50" cy="50" r="20" stroke="white"/><path d="M 0 0 L 100 100 C 50 0 50 100 100 0" stroke="blue"/></svg>'
shapes = agent.design_from_html(svg, context={'activeLayer': 'layer-0', 'activeLayerColor': '#fff'})
print(f'Test 1 - SVG conversion: {len(shapes)} shapes')
for s in shapes:
    print(f'  {s["type"]}: id={s["id"][:8]}... color={s.get("color")}')
assert len(shapes) >= 3, f"Expected >=3 shapes, got {len(shapes)}"

# Test 2: SVG extraction from text
text = 'Here is a design:\n```svg\n<svg><rect x="0" y="0" width="100" height="50"/></svg>\n```\nEnjoy!'
extracted = agent._extract_and_convert_svg(text)
print(f'\nTest 2 - SVG extraction: {len(extracted)} shapes from text')
assert len(extracted) >= 1, f"Expected >=1 shapes, got {len(extracted)}"

# Test 3: Shape validation
valid = agent._validate_shape({'type': 'circle', 'cx': 10, 'cy': 20, 'radius': 5})
print(f'\nTest 3 - Validation: {valid is not None}  type={valid["type"]}')
assert valid is not None
assert valid['type'] == 'circle'

bad = agent._validate_shape({'type': 'unknown_thing'})
print(f'Test 3b - Invalid type: {bad is None}')
assert bad is None

# Test 4: Ellipse validation
ell = agent._validate_shape({'type': 'ellipse', 'cx': 0, 'cy': 0, 'rx': 30, 'ry': 20})
print(f'\nTest 4 - Ellipse: {ell is not None}  rx={ell["rx"]} ry={ell["ry"]}')
assert ell is not None
assert ell['rx'] == 30 and ell['ry'] == 20

# Test 5: Clean display text
cleaned = agent._clean_display_text('Look: ```svg\n<svg><rect/></svg>\n```')
print(f'\nTest 5 - Clean text: "{cleaned}"')
assert 'SVG design generated' in cleaned

# Test 6: Polyline validation
poly = agent._validate_shape({'type': 'polyline', 'points': [[0,0],[10,10],[20,0]], 'closed': True})
print(f'\nTest 6 - Polyline: {poly is not None}  points={len(poly["points"])} closed={poly["closed"]}')
assert poly is not None
assert len(poly['points']) == 3

# Test 7: Text validation
txt = agent._validate_shape({'type': 'text', 'x': 0, 'y': 0, 'content': 'Hello', 'fontSize': 16})
print(f'\nTest 7 - Text: {txt is not None}  content="{txt["content"]}"')
assert txt is not None

# Test 8: HTML design prompt exists
print(f'\nTest 8 - HTML_DESIGN_PROMPT length: {len(HTML_DESIGN_PROMPT)} chars')
assert len(HTML_DESIGN_PROMPT) > 100

print('\n=== ALL 8 TESTS PASSED ===')
