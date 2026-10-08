import datetime
import json
from pathlib import Path

DATA_DIRECTORY = Path(__file__).resolve().parents[1] / 'public' / 'data'


def read_json(path):
    return json.loads(Path(path).read_text())


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')


def parse_retrieval_date(value=None):
    return datetime.date.fromisoformat(value) if value else datetime.date.today()
