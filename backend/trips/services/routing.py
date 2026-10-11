"""ORS transport and response normalization; the scheduler stays provider-independent."""
import json
import logging
from math import isfinite
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from rest_framework.exceptions import APIException, ValidationError

logger = logging.getLogger(__name__)


class RoutingUnavailable(APIException):
    status_code = 503
    default_detail = 'Routing is temporarily unavailable. Please try again.'
    default_code = 'routing_unavailable'


def request_ors(path, parameters=None, body=None):
    if not settings.ORS_API_KEY:
        raise RoutingUnavailable('The routing service is not configured.')
    url = 'https://api.openrouteservice.org' + path
    if parameters:
        url += '?' + urlencode(parameters)
    # The GeoJSON endpoint rejects application/json-only Accept headers (406).
    content_type = 'application/geo+json' if path.endswith('/geojson') else 'application/json'
    headers = {'Authorization': settings.ORS_API_KEY, 'Accept': content_type}
    data = None
    if body is not None:
        headers['Content-Type'] = 'application/json'
        data = json.dumps(body).encode('utf-8')
    request = Request(url, data=data, headers=headers)
    try:
        with urlopen(request, timeout=settings.ORS_TIMEOUT_SECONDS) as response:
            return json.load(response)
    except HTTPError as error:
        # Never forward provider bodies/URLs: they may contain credentials.
        logger.warning('ORS %s returned HTTP %s', path, error.code)
        if error.code == 429:
            raise RoutingUnavailable('The routing request limit was reached. Please try later.') from None
        if error.code in (400, 404, 413, 422):
            raise ValidationError({'route': 'No supported road route was found. Check the locations or try a shorter trip.'}) from None
        raise RoutingUnavailable() from None
    except (URLError, TimeoutError, OSError) as error:
        logger.warning('ORS %s failed with %s', path, type(error).__name__)
        raise RoutingUnavailable() from None
    except (ValueError, UnicodeError):
        raise RoutingUnavailable('The routing service returned an invalid response.') from None


def validate_coordinates(coordinates):
    if not isinstance(coordinates, list) or len(coordinates) != 2:
        raise ValueError('Invalid coordinates')
    longitude, latitude = coordinates
    if not all(type(value) in (int, float) and isfinite(value) for value in coordinates):
        raise ValueError('Invalid coordinates')
    if not -180 <= longitude <= 180 or not -90 <= latitude <= 90:
        raise ValueError('Invalid coordinates')


def search_locations(text):
    """Return candidates for explicit selection; never choose a match for the user."""
    result = request_ors('/geocode/search', parameters={'text': text, 'size': 5})
    try:
        matches = []
        for feature in result['features']:
            coordinates = feature['geometry']['coordinates']
            validate_coordinates(coordinates)
            properties = feature['properties']
            label = properties['label']
            if not isinstance(label, str) or not label.strip() or len(label) > 255:
                raise ValueError('Invalid location label')
            matches.append({
                'label': label, 'longitude': coordinates[0], 'latitude': coordinates[1],
                'precision': properties.get('layer', 'unknown'),
            })
        return matches
    except (KeyError, IndexError, TypeError, ValueError):
        raise RoutingUnavailable('The location service returned an invalid response.') from None


def route_leg(start, end, leg_type):
    # Identical locations still require handling, but no driving or ORS request.
    if start == end:
        return {'type': leg_type, 'duration_seconds': 0, 'distance_meters': 0,
                'geometry': {'type': 'LineString', 'coordinates': [start, end]},
                'steps': [], 'warnings': []}
    result = request_ors('/v2/directions/driving-hgv/geojson', body={
        'coordinates': [start, end], 'instructions': True, 'units': 'm',
    })
    try:
        feature = result['features'][0]
        properties = feature['properties']
        summary = properties['summary']
        distance = summary['distance']
        duration = summary['duration']
        if not all(isinstance(value, (int, float)) and isfinite(value) and value > 0
                   for value in (distance, duration)):
            raise ValueError('Invalid route totals')
        geometry = feature['geometry']
        if geometry['type'] != 'LineString' or len(geometry['coordinates']) < 2:
            raise ValueError('Invalid route geometry')
        for coordinates in geometry['coordinates']:
            validate_coordinates(coordinates)
        segments = properties['segments']
        if len(segments) != 1:
            raise ValueError('Expected one segment')
        return {'type': leg_type, 'duration_seconds': duration, 'distance_meters': distance,
                'geometry': geometry, 'steps': segments[0]['steps'],
                'warnings': properties.get('warnings', [])}
    except (KeyError, IndexError, TypeError, ValueError):
        raise RoutingUnavailable('The routing service returned an invalid route.') from None


def get_trip_route(inputs):
    fields = ('current_location', 'pickup_location', 'dropoff_location')
    locations = {}
    for field in fields:
        selected = inputs[field]
        locations[field] = {
            'label': selected['label'],
            'coordinates': [selected['longitude'], selected['latitude']],
        }
    coordinates = [locations[field]['coordinates'] for field in fields]
    # Request legs separately: each leg has independent geometry and instructions.
    legs = [
        route_leg(coordinates[0], coordinates[1], 'drive_to_pickup'),
        route_leg(coordinates[1], coordinates[2], 'drive_to_dropoff'),
    ]
    return {
        'source': 'openrouteservice', 'profile': 'driving-hgv',
        'attribution': '© openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors',
        'locations': locations, 'legs': legs,
        'distance_meters': sum(leg['distance_meters'] for leg in legs),
        'duration_seconds': sum(leg['duration_seconds'] for leg in legs),
        'geometry': {'type': 'MultiLineString',
                     'coordinates': [leg['geometry']['coordinates'] for leg in legs]},
        'note': 'User-selected locations are shown in locations; road endpoints may differ from selected points. HGV routing uses provider defaults; vehicle dimensions are unspecified. Fuel and rest events do not identify verified facilities.',
    }
