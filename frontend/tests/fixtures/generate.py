"""Generate deterministic API fixtures with the real backend and mocked routing.

Run from the repository root using backend/.venv/Scripts/python.exe.
No provider requests or API credentials are needed.
"""
import json
import os
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
import sys
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

from trips.services.trip_planner import plan_trip

INPUTS = {'current_location': 'Chicago, IL', 'pickup_location': 'Indianapolis, IN',
          'dropoff_location': 'Atlanta, GA', 'cycle_used_hours': Decimal('24')}
POINTS = [[-87.6298, 41.8781], [-86.1581, 39.7684], [-84.388, 33.749]]
LEGS = [
    {'type': 'drive_to_pickup', 'duration_seconds': 14400.25, 'distance_meters': 300000.5,
     'geometry': {'type': 'LineString', 'coordinates': POINTS[:2]}, 'steps': [], 'warnings': []},
    {'type': 'drive_to_dropoff', 'duration_seconds': 43200.5, 'distance_meters': 800000.25,
     'geometry': {'type': 'LineString', 'coordinates': POINTS[1:]}, 'steps': [], 'warnings': []},
]
ROUTE = {
    'source': 'openrouteservice', 'profile': 'driving-hgv', 'attribution': 'Test route | OpenStreetMap contributors',
    'locations': {key: {'label': INPUTS[key], 'coordinates': point}
                  for key, point in zip(list(INPUTS)[:3], POINTS)},
    'legs': LEGS, 'distance_meters': 1100000.75, 'duration_seconds': 57600.75,
    'geometry': {'type': 'MultiLineString', 'coordinates': [POINTS[:2], POINTS[1:]]},
}

for filename, now, cycle in [
    ('trip.json', datetime(2026, 10, 11, 15, tzinfo=UTC), '24'),
    ('fall-back.json', datetime(2026, 10, 30, 15, tzinfo=UTC), '70'),
    ('spring-forward.json', datetime(2026, 3, 6, 15, tzinfo=UTC), '70'),
]:
    with patch('trips.services.trip_planner.get_trip_route', return_value=ROUTE):
        result = plan_trip({**INPUTS, 'cycle_used_hours': Decimal(cycle)}, now=now)
    Path(__file__).with_name(filename).write_text(json.dumps(result, default=str, indent=2), encoding='utf-8')
