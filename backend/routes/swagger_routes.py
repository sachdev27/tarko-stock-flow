"""
Swagger/OpenAPI documentation routes
Dynamically generates OpenAPI 3.0 spec from API_SIGNATURES.json
"""

from flask import Blueprint, jsonify, send_from_directory
import json
import os

swagger_bp = Blueprint('swagger', __name__, url_prefix='/api')

# Path to API_SIGNATURES.json
SIGNATURES_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'API_SIGNATURES.json')

def load_api_signatures():
    """Load API signatures from JSON file"""
    try:
        with open(SIGNATURES_PATH, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading API signatures: {e}")
        return {}

def convert_to_openapi_type(type_str):
    """Convert custom type strings to OpenAPI types"""
    type_mapping = {
        'UUID': {'type': 'string', 'format': 'uuid'},
        'string': {'type': 'string'},
        'integer': {'type': 'integer'},
        'float': {'type': 'number', 'format': 'float'},
        'boolean': {'type': 'boolean'},
        'array': {'type': 'array'},
        'object': {'type': 'object'},
        'date': {'type': 'string', 'format': 'date'},
        'datetime': {'type': 'string', 'format': 'date-time'},
        'ISO8601DateTime': {'type': 'string', 'format': 'date-time'},
    }

    if isinstance(type_str, dict):
        return type_str

    return type_mapping.get(type_str, {'type': 'string'})

def generate_schema_from_object(obj_def):
    """Generate OpenAPI schema from object definition"""
    if not isinstance(obj_def, dict):
        return convert_to_openapi_type(obj_def)

    properties = {}
    required = []

    for key, value in obj_def.items():
        if key in ['type', 'required', 'description']:
            continue

        if isinstance(value, dict):
            prop_type = value.get('type', 'string')
            prop_desc = value.get('description', '')
            prop_required = value.get('required', False)

            if prop_required:
                required.append(key)

            if prop_type == 'array' and 'items' in value:
                items_def = value['items']
                if isinstance(items_def, dict) and not items_def.get('type'):
                    # Complex object in array
                    properties[key] = {
                        'type': 'array',
                        'description': prop_desc,
                        'items': generate_schema_from_object(items_def)
                    }
                else:
                    properties[key] = {
                        'type': 'array',
                        'description': prop_desc,
                        'items': convert_to_openapi_type(items_def if isinstance(items_def, str) else items_def.get('type', 'string'))
                    }
            elif prop_type == 'object':
                properties[key] = {
                    **convert_to_openapi_type(prop_type),
                    'description': prop_desc
                }
            else:
                properties[key] = {
                    **convert_to_openapi_type(prop_type),
                    'description': prop_desc
                }
        else:
            # Simple value
            properties[key] = convert_to_openapi_type(value)

    schema = {'type': 'object', 'properties': properties}
    if required:
        schema['required'] = required

    return schema

def generate_openapi_spec():
    """Generate OpenAPI 3.0 specification from API_SIGNATURES.json"""
    signatures = load_api_signatures()

    spec = {
        'openapi': '3.0.0',
        'info': {
            'title': 'Tarko Inventory Management System API',
            'version': '1.0.0',
            'description': 'Complete API documentation for Tarko Stock Flow inventory management system',
            'contact': {
                'name': 'API Support',
                'email': 'support@tarko.com'
            }
        },
        'servers': [
            {
                'url': 'http://localhost:5500',
                'description': 'Development server'
            },
            {
                'url': 'https://tarko-stock-flow.web.app',
                'description': 'Production server'
            }
        ],
        'components': {
            'securitySchemes': {
                'BearerAuth': {
                    'type': 'http',
                    'scheme': 'bearer',
                    'bearerFormat': 'JWT',
                    'description': 'JWT Authorization header using the Bearer scheme'
                }
            },
            'schemas': {}
        },
        'security': [{'BearerAuth': []}],
        'paths': {}
    }

    # Process each route category
    for category, routes in signatures.items():
        for path, route_def in routes.items():
            if not isinstance(route_def, dict):
                continue

            method = route_def.get('method', 'GET').lower()
            description = route_def.get('description', '')
            auth_required = 'JWT Required' in route_def.get('authentication', '')

            # Initialize path if not exists
            if path not in spec['paths']:
                spec['paths'][path] = {}

            # Build operation object
            operation = {
                'summary': description,
                'description': description,
                'tags': [category.replace('_routes', '').replace('_', ' ').title()],
                'responses': {
                    '200': {
                        'description': 'Successful response',
                        'content': {
                            'application/json': {
                                'schema': {}
                            }
                        }
                    },
                    '400': {
                        'description': 'Bad request'
                    },
                    '401': {
                        'description': 'Unauthorized'
                    },
                    '500': {
                        'description': 'Internal server error'
                    }
                }
            }

            # Add security if required
            if auth_required:
                operation['security'] = [{'BearerAuth': []}]
            else:
                operation['security'] = []

            # Add request body for POST/PUT methods
            if method in ['post', 'put'] and 'request_body' in route_def:
                request_schema = generate_schema_from_object(route_def['request_body'])
                operation['requestBody'] = {
                    'required': True,
                    'content': {
                        'application/json': {
                            'schema': request_schema
                        }
                    }
                }

            # Add query parameters for GET methods
            if method == 'get' and 'query_params' in route_def:
                operation['parameters'] = []
                for param_name, param_def in route_def['query_params'].items():
                    if isinstance(param_def, dict):
                        param = {
                            'name': param_name,
                            'in': 'query',
                            'description': param_def.get('description', ''),
                            'required': param_def.get('required', False),
                            'schema': convert_to_openapi_type(param_def.get('type', 'string'))
                        }
                        operation['parameters'].append(param)

            # Add path parameters
            if '{' in path and '}' in path:
                if 'parameters' not in operation:
                    operation['parameters'] = []

                import re
                path_params = re.findall(r'\{(\w+)\}', path)
                for param_name in path_params:
                    operation['parameters'].append({
                        'name': param_name,
                        'in': 'path',
                        'required': True,
                        'schema': {'type': 'string'}
                    })

            # Add response schema
            if 'response' in route_def:
                response_schema = generate_schema_from_object(route_def['response'])
                operation['responses']['200']['content']['application/json']['schema'] = response_schema

            spec['paths'][path][method] = operation

    return spec

@swagger_bp.route('/docs/openapi.json', methods=['GET'])
def get_openapi_spec():
    """Get OpenAPI specification as JSON"""
    try:
        spec = generate_openapi_spec()
        return jsonify(spec), 200
    except Exception as e:
        return jsonify({'error': f'Failed to generate OpenAPI spec: {str(e)}'}), 500

@swagger_bp.route('/docs', methods=['GET'])
def swagger_ui():
    """Serve Swagger UI HTML"""
    html = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Tarko API Documentation</title>
        <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui.css">
        <style>
            html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
            *, *:before, *:after { box-sizing: inherit; }
            body { margin: 0; padding: 0; }
        </style>
    </head>
    <body>
        <div id="swagger-ui"></div>
        <script src="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui-bundle.js"></script>
        <script src="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui-standalone-preset.js"></script>
        <script>
            window.onload = function() {
                const ui = SwaggerUIBundle({
                    url: "/api/docs/openapi.json",
                    dom_id: '#swagger-ui',
                    deepLinking: true,
                    presets: [
                        SwaggerUIBundle.presets.apis,
                        SwaggerUIStandalonePreset
                    ],
                    plugins: [
                        SwaggerUIBundle.plugins.DownloadUrl
                    ],
                    layout: "StandaloneLayout",
                    persistAuthorization: true
                });
                window.ui = ui;
            };
        </script>
    </body>
    </html>
    """
    return html, 200, {'Content-Type': 'text/html'}

@swagger_bp.route('/docs/redoc', methods=['GET'])
def redoc_ui():
    """Serve ReDoc UI HTML (alternative documentation viewer)"""
    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Tarko API Documentation - ReDoc</title>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet">
        <style>
            body { margin: 0; padding: 0; }
        </style>
    </head>
    <body>
        <redoc spec-url='/api/docs/openapi.json'></redoc>
        <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
    </body>
    </html>
    """
    return html, 200, {'Content-Type': 'text/html'}
