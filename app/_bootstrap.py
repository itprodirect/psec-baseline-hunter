import sys
from pathlib import Path

# Add repo root (parent of /app) to Python path so we can import sibling modules like /core
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
