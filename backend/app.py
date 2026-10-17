"""ClubHub Flask API: Neo4j-backed read endpoints for all current sections."""
import os
from datetime import date, datetime, time
from flask import Flask, jsonify, request, session, g
from flask_cors import CORS
from dotenv import load_dotenv
from neo4j import GraphDatabase
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash
from flask_cors import CORS

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))
app = Flask(__name__)
CORS(
    app,
    origins=[
        "http://localhost:5174",
        "https://club-management-system-rho.vercel.app",
        "https://club-management-system-o99yushii-rajani2025vit.vercel.app"
    ],
    supports_credentials=True
)
app.config.update(SECRET_KEY=os.getenv('FLASK_SECRET_KEY', ''), SESSION_COOKIE_HTTPONLY=True,
                  SESSION_COOKIE_SAMESITE='Lax', SESSION_COOKIE_SECURE=False)
if not app.config['SECRET_KEY']:
    raise RuntimeError('Set FLASK_SECRET_KEY in backend/.env before starting Flask')
CORS(
    app,
    supports_credentials=True,
    resources={
        r'/api/*': {
            'origins': [
                'http://localhost:5173',
                'http://127.0.0.1:5173',
                'https://club-management-system-rho.vercel.app',
                'https://club-management-system-o99yushii-rajani2025vit.vercel.app'
            ]
        }
    }
)
DATABASE = os.getenv('NEO4J_DATABASE', 'neo4j')
driver = GraphDatabase.driver(os.getenv('NEO4J_URI'), auth=(os.getenv('NEO4J_USERNAME'), os.getenv('NEO4J_PASSWORD')))


def read_query(query):
    with driver.session(database=DATABASE) as session:
        return [record.data() for record in session.run(query)]


def json_safe(value):
    """Convert Neo4j date/time and nested property values for JSON."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (date, datetime, time)) or hasattr(value, 'iso_format'):
        return str(value)
    if isinstance(value, dict):
        return {str(k): json_safe(v) for k, v in value.items() if k not in ("passwordHash",)}
    if isinstance(value, (list, tuple)):
        return [json_safe(v) for v in value]
    return str(value)




# A login account is stored on its matching Student node. Club leads have
# MANAGES relationships to the clubs they may edit.
def current_user():
    reg = session.get('reg')
    if not reg:
        return None
    with driver.session(database=DATABASE) as db:
        row = db.run('''MATCH (s:Student {registrationNo:$reg})
                        RETURN s.registrationNo AS registrationNo, s.name AS name,
                               coalesce(s.accountRole, 'student') AS role''', reg=reg).single()
        return row.data() if row and row['role'] in ('student','club_lead','admin') else None


def can_manage(club_id):
    user = g.user
    if user['role'] == 'admin':
        return True
    if user['role'] != 'club_lead' or not club_id:
        return False
    with driver.session(database=DATABASE) as db:
        return db.run('''MATCH (s:Student {registrationNo:$reg})-[:MANAGES]->(c:Club {clubId:$club})
                         RETURN count(c) AS n''', reg=user['registrationNo'], club=club_id).single()['n'] > 0


@app.before_request
def enforce_permissions():
    if not request.path.startswith('/api/') or request.method == 'OPTIONS':
        return
    if request.path in ('/api/auth/login', '/api/auth/signup'):
        return
    g.user = current_user()
    if not g.user:
        return jsonify(error='Please log in first.'), 401
    if request.path.startswith('/api/auth/') or request.method == 'GET':
        return
    path = request.path
    if path.startswith('/api/students') or path.startswith('/api/clubs'):
        if g.user['role'] != 'admin':
            return jsonify(error='Admin access required.'), 403
    elif path.startswith('/api/events') or path.startswith('/api/recruitments'):
        if g.user['role'] == 'admin':
            return
        data = request.get_json(silent=True) or {}
        club_id = data.get('clubId')
        if request.method in ('PUT','DELETE'):
            label, field = ('Event','eventId') if path.startswith('/api/events') else ('Recruitment','recruitmentId')
            target_id = path.rsplit('/', 1)[-1]
            rel = 'ORGANIZES' if label == 'Event' else 'HAS_RECRUITMENT'
            with driver.session(database=DATABASE) as db:
                row = db.run(f'''MATCH (c:Club)-[:{rel}]->(n:{label}) WHERE n.{field}=$id
                                  RETURN c.clubId AS clubId''', id=target_id).single()
            if not row or not can_manage(row['clubId']):
                return jsonify(error='You cannot manage this club.'), 403
            if request.method == 'PUT' and club_id != row['clubId']:
                return jsonify(error='Club leads cannot transfer records to another club.'), 403
        elif not can_manage(club_id):
            return jsonify(error='Club Lead access required for this club.'), 403
    elif path in ('/api/event-registrations', '/api/recruitment-applications', '/api/memberships'):
        data = request.get_json(silent=True) or {}
        if str(data.get('registrationNo', '')).upper() != g.user['registrationNo']:
            return jsonify(error='You can only act for your own account.'), 403
    else:
        return jsonify(error='This action is not allowed.'), 403


@app.route('/api/auth/signup', methods=['POST'])
def signup():
    data = request.get_json(silent=True) or {}
    reg = str(data.get('registrationNo') or '').strip().upper()
    name = str(data.get('name') or '').strip()
    email = str(data.get('email') or '').strip().lower()
    department = str(data.get('department') or '').strip()
    password = str(data.get('password') or '')
    try:
        year = int(data.get('year', 1))
    except (ValueError, TypeError):
        year = 0
    if not reg or len(reg) > 30 or len(password) < 8 or len(password) > 128 or not name or '@' not in email or not department or year not in (1,2,3,4):
        return jsonify(error='Provide registration number, name, email, department, year (1-4) and password (8+ characters).'), 400
    password_hash = generate_password_hash(password)
    with driver.session(database=DATABASE) as db:
        def create(tx):
            found = tx.run('MATCH (s:Student {registrationNo:$reg}) RETURN s.passwordHash AS hash, s.email AS email', reg=reg).single()
            if found and found['hash']:
                return False
            if not found:
                other = tx.run('MATCH (s:Student {email:$email}) RETURN count(s) AS n', email=email).single()['n']
                if other:
                    return False
                tx.run('''CREATE (s:Student {registrationNo:$reg, name:$name, email:$email,
                          department:$department, year:$year, passwordHash:$hash, accountRole:'student'})''',
                       reg=reg, name=name, email=email, department=department, year=year, hash=password_hash).consume()
            else:
                # Existing students may claim their account only if their email matches.
                if (found['email'] or '').lower() != email:
                    return False
                tx.run('MATCH (s:Student {registrationNo:$reg}) SET s.passwordHash=$hash, s.accountRole=coalesce(s.accountRole, "student")', reg=reg, hash=password_hash).consume()
            return True
        created = db.execute_write(create)
    if not created:
        return jsonify(error='Account already exists, or registration number/email does not match.'), 409
    session.clear()
    session['reg'] = reg
    return jsonify(registrationNo=reg, name=name, role='student'), 201


@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json(silent=True) or {}
    reg = str(data.get('registrationNo') or '').strip().upper()
    with driver.session(database=DATABASE) as db:
        row = db.run('MATCH (s:Student {registrationNo:$reg}) RETURN s.passwordHash AS hash', reg=reg).single()
    if not row or not row['hash'] or not check_password_hash(row['hash'], str(data.get('password') or '')):
        return jsonify(error='Invalid registration number or password.'), 401
    session.clear()
    session['reg'] = reg
    return jsonify(current_user())


@app.route('/api/auth/me')
def me():
    return jsonify(g.user)


@app.route('/api/auth/managed-clubs')
def managed_clubs():
    """Return only the club IDs that the logged-in lead can manage."""
    if g.user['role'] == 'admin':
        with driver.session(database=DATABASE) as db:
            ids = [r['clubId'] for r in db.run('MATCH (c:Club) RETURN c.clubId AS clubId')]
    elif g.user['role'] == 'club_lead':
        with driver.session(database=DATABASE) as db:
            ids = [r['clubId'] for r in db.run("""
                MATCH (s:Student {registrationNo:$reg})-[:MANAGES]->(c:Club)
                RETURN DISTINCT c.clubId AS clubId
            """, reg=g.user['registrationNo'])]
    else:
        ids = []
    return jsonify(clubIds=ids)


@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify(message='Logged out.')


@app.route('/api/auth/assign-lead', methods=['POST'])
def assign_lead():
    if g.user['role'] != 'admin':
        return jsonify(error='Admin only.'), 403
    data = request.get_json(silent=True) or {}
    reg = str(data.get('registrationNo') or '').strip().upper()
    club = str(data.get('clubId') or '').strip()
    with driver.session(database=DATABASE) as db:
        row = db.run('''MATCH (s:Student {registrationNo:$reg, accountRole:'student'}), (c:Club {clubId:$club})
                        MERGE (s)-[:MANAGES]->(c) SET s.accountRole='club_lead'
                        RETURN s.registrationNo AS registrationNo, c.clubId AS clubId''', reg=reg, club=club).single()
    if not row:
        return jsonify(error='Student account or club not found (or role not student).'), 404
    return jsonify(row.data())

@app.route('/')
def home():
    return 'Club Management Backend Running!'


@app.route('/api/students')
def students():
    rows = read_query('''
        MATCH (s:Student)
        OPTIONAL MATCH (s)-[:MEMBER_OF]->(c:Club)
        RETURN s.registrationNo AS registrationNo, s.name AS name,
               s.email AS email, s.department AS department, s.year AS year,
               count(DISTINCT c) AS clubs
        ORDER BY name
    ''')
    return jsonify(json_safe(rows))


def student_payload():
    data = request.get_json(silent=True) or {}
    name = str(data.get('name') or '').strip()
    email = str(data.get('email') or '').strip().lower()
    department = str(data.get('department') or '').strip()
    try:
        year = int(data.get('year'))
    except (ValueError, TypeError):
        year = 0
    if not name or not email or '@' not in email or not department or year not in (1, 2, 3, 4):
        return None
    return dict(name=name, email=email, department=department, year=year)


@app.route('/api/students', methods=['POST'])
def create_student():
    data = request.get_json(silent=True) or {}
    reg = str(data.get('registrationNo') or '').strip().upper()
    payload = student_payload()
    if not reg or not payload:
        return jsonify(error='Valid registration number, name, email, department and year are required.'), 400
    with driver.session(database=DATABASE) as session:
        # Do not overwrite an existing student or duplicate email.
        existing = session.run('''
            MATCH (s:Student)
            WHERE s.registrationNo = $reg OR s.email = $email
            RETURN count(s) AS total
        ''', reg=reg, email=payload['email']).single()['total']
        if existing:
            return jsonify(error='Registration number or email already exists.'), 409
        try:
            row = session.run('''
                CREATE (s:Student {registrationNo:$reg, name:$name, email:$email,
                                   department:$department, year:$year})
                RETURN s.registrationNo AS registrationNo, s.name AS name,
                       s.email AS email, s.department AS department, s.year AS year
            ''', reg=reg, **payload).single().data()
        except Exception as exc:
            if 'ConstraintValidationFailed' in str(exc):
                return jsonify(error='Registration number or email already exists.'), 409
            raise
    return jsonify(row), 201


@app.route('/api/students/<registration_no>', methods=['PUT'])
def update_student(registration_no):
    payload = student_payload()
    if not payload:
        return jsonify(error='Valid name, email, department and year are required.'), 400
    reg = registration_no.strip().upper()
    with driver.session(database=DATABASE) as session:
        if session.run('''
            MATCH (s:Student {email:$email})
            WHERE s.registrationNo <> $reg
            RETURN count(s) AS total
        ''', email=payload['email'], reg=reg).single()['total']:
            return jsonify(error='Email is already used by another student.'), 409
        try:
            record = session.run('''
                MATCH (s:Student {registrationNo:$reg})
                SET s.name=$name, s.email=$email, s.department=$department, s.year=$year
                RETURN s.registrationNo AS registrationNo, s.name AS name,
                       s.email AS email, s.department AS department, s.year AS year
            ''', reg=reg, **payload).single()
        except Exception as exc:
            if 'ConstraintValidationFailed' in str(exc):
                return jsonify(error='Email is already used by another student.'), 409
            raise
    if record is None:
        return jsonify(error='Student not found.'), 404
    return jsonify(record.data())


@app.route('/api/students/<registration_no>', methods=['DELETE'])
def delete_student(registration_no):
    reg = registration_no.strip().upper()
    with driver.session(database=DATABASE) as session:
        record = session.run('''
            MATCH (s:Student {registrationNo:$reg})
            WITH s, s.registrationNo AS deletedId
            DETACH DELETE s
            RETURN deletedId
        ''', reg=reg).single()
    if record is None:
        return jsonify(error='Student not found.'), 404
    return jsonify(message='Student deleted.', registrationNo=reg)


@app.route('/api/clubs')
def clubs():
    rows = read_query('''
        MATCH (c:Club)
        OPTIONAL MATCH (s:Student)-[:MEMBER_OF]->(c)
        RETURN c.clubId AS clubId, c.clubName AS name,
               c.category AS category, c.establishedYear AS establishedYear,
               count(DISTINCT s) AS members
        ORDER BY clubId
    ''')
    return jsonify(json_safe(rows))


def club_payload():
    data = request.get_json(silent=True) or {}
    name = str(data.get('name') or data.get('clubName') or '').strip()
    category = str(data.get('category') or '').strip()
    try:
        established_year = int(data.get('establishedYear'))
    except (TypeError, ValueError):
        established_year = 0
    if not name or not category or not (1900 <= established_year <= 2100) or len(name) > 100 or len(category) > 60:
        return None
    return {'name': name, 'category': category, 'establishedYear': established_year}


@app.route('/api/clubs', methods=['POST'])
def create_club():
    data = request.get_json(silent=True) or {}
    club_id = str(data.get('clubId') or '').strip().upper()
    payload = club_payload()
    if not club_id or len(club_id) > 30 or not payload:
        return jsonify(error='Club ID, name, category and valid established year are required.'), 400
    with driver.session(database=DATABASE) as session:
        existing = session.run('MATCH (c:Club {clubId:$id}) RETURN c.clubId AS id', id=club_id).single()
        if existing:
            return jsonify(error='Club ID already exists.'), 409
        try:
            record = session.run('''
                CREATE (c:Club {clubId:$id, clubName:$name, category:$category, establishedYear:$establishedYear})
                RETURN c.clubId AS clubId, c.clubName AS name, c.category AS category,
                       c.establishedYear AS establishedYear, 0 AS members
            ''', id=club_id, **payload).single()
        except Exception as exc:
            if 'ConstraintValidationFailed' in str(exc):
                return jsonify(error='Club ID already exists.'), 409
            raise
    return jsonify(record.data()), 201


@app.route('/api/clubs/<club_id>', methods=['PUT'])
def update_club(club_id):
    payload = club_payload()
    if not payload:
        return jsonify(error='Valid club name, category and established year are required.'), 400
    with driver.session(database=DATABASE) as session:
        record = session.run('''
            MATCH (c:Club {clubId:$id})
            SET c.clubName=$name, c.category=$category, c.establishedYear=$establishedYear
            RETURN c.clubId AS clubId, c.clubName AS name, c.category AS category,
                   c.establishedYear AS establishedYear
        ''', id=club_id.strip().upper(), **payload).single()
    if record is None:
        return jsonify(error='Club not found.'), 404
    return jsonify(record.data())


@app.route('/api/clubs/<club_id>', methods=['DELETE'])
def delete_club(club_id):
    club_id = club_id.strip().upper()
    with driver.session(database=DATABASE) as session:
        # Atomic guarded delete: do not silently detach existing relationships.
        def guarded_delete(tx):
            row = tx.run('''
                MATCH (c:Club {clubId:$id})
                OPTIONAL MATCH (c)-[r]-()
                WITH c, count(r) AS relationships
                FOREACH (_ IN CASE WHEN relationships = 0 THEN [1] ELSE [] END | DELETE c)
                RETURN relationships AS relationships
            ''', id=club_id).single()
            return None if row is None else row['relationships']
        count = session.execute_write(guarded_delete)
    if count is None:
        return jsonify(error='Club not found.'), 404
    if count > 0:
        return jsonify(error='This club has linked students, events or recruitments. Remove or reassign those relationships first.'), 409
    return jsonify(message='Club deleted.', clubId=club_id)


@app.route('/api/events')
def events():
    rows = read_query('''
        MATCH (e:Event)
        OPTIONAL MATCH (c:Club)-[:ORGANIZES]->(e)
        OPTIONAL MATCH (s:Student)-[:REGISTERED_FOR]->(e)
        RETURN e.eventId AS eventId, e.eventName AS eventName,
               toString(e.eventDate) AS eventDate, e.eventType AS eventType,
               e.venue AS venue, e.mode AS mode, e.budget AS budget,
               c.clubName AS clubName, count(DISTINCT s) AS attendees
        ORDER BY eventDate
    ''')
    return jsonify(json_safe(rows))




def event_payload():
    data = request.get_json(silent=True) or {}
    payload = {
        'eventName': str(data.get('eventName') or '').strip(),
        'clubId': str(data.get('clubId') or '').strip().upper(),
        'eventDate': str(data.get('eventDate') or '').strip(),
        'eventType': str(data.get('eventType') or '').strip(),
        'venue': str(data.get('venue') or '').strip(),
        'mode': str(data.get('mode') or '').strip(),
    }
    if not all(payload.values()):
        return None, 'All event fields except budget are required.'
    try:
        date.fromisoformat(payload['eventDate'])
        budget = float(data.get('budget') or 0)
    except (ValueError, TypeError):
        return None, 'Enter a valid date and budget.'
    if budget < 0 or budget > 100000000:
        return None, 'Budget must be between 0 and 100000000.'
    if any(len(str(v)) > 150 for v in payload.values()):
        return None, 'Event fields must be at most 150 characters.'
    payload['budget'] = budget
    return payload, None


@app.route('/api/events', methods=['POST'])
def create_event():
    payload, error = event_payload()
    if error:
        return jsonify(error=error), 400
    eid = str((request.get_json(silent=True) or {}).get('eventId') or '').strip().upper()
    if not eid or len(eid) > 30:
        return jsonify(error='Valid event ID is required.'), 400
    with driver.session(database=DATABASE) as session:
        if not session.run('MATCH (c:Club {clubId:$clubId}) RETURN c', clubId=payload['clubId']).single():
            return jsonify(error='Selected club not found.'), 404
        if session.run('MATCH (e:Event {eventId:$eid}) RETURN e', eid=eid).single():
            return jsonify(error='Event ID already exists.'), 409
        row = session.run('''
            MATCH (c:Club {clubId:$clubId})
            CREATE (e:Event {eventId:$eid, eventName:$eventName, eventDate:$eventDate,
              eventType:$eventType, venue:$venue, mode:$mode, budget:$budget})
            CREATE (c)-[:ORGANIZES]->(e)
            RETURN properties(e) AS event
        ''', eid=eid, **payload).single()
    return jsonify(json_safe(row['event'])), 201


@app.route('/api/events/<event_id>', methods=['PUT'])
def update_event(event_id):
    payload, error = event_payload()
    if error:
        return jsonify(error=error), 400
    eid = event_id.strip().upper()
    with driver.session(database=DATABASE) as session:
        if not session.run('MATCH (c:Club {clubId:$clubId}) RETURN c', clubId=payload['clubId']).single():
            return jsonify(error='Selected club not found.'), 404
        row = session.run('''
            MATCH (e:Event {eventId:$eid})
            MATCH (c:Club {clubId:$clubId})
            OPTIONAL MATCH (:Club)-[old:ORGANIZES]->(e)
            DELETE old
            MERGE (c)-[:ORGANIZES]->(e)
            SET e.eventName=$eventName, e.eventDate=$eventDate,
                e.eventType=$eventType, e.venue=$venue, e.mode=$mode, e.budget=$budget
            RETURN properties(e) AS event
        ''', eid=eid, **payload).single()
    if row is None:
        return jsonify(error='Event not found.'), 404
    return jsonify(json_safe(row['event']))


@app.route('/api/events/<event_id>', methods=['DELETE'])
def delete_event(event_id):
    eid = event_id.strip().upper()
    with driver.session(database=DATABASE) as session:
        def guarded_delete(tx):
            row = tx.run('''
                MATCH (e:Event {eventId:$eid})
                OPTIONAL MATCH (:Student)-[reg:REGISTERED_FOR]->(e)
                WITH e, count(reg) AS registrations
                FOREACH (_ IN CASE WHEN registrations = 0 THEN [1] ELSE [] END | DETACH DELETE e)
                RETURN registrations
            ''', eid=eid).single()
            return None if row is None else row['registrations']
        count = session.execute_write(guarded_delete)
    if count is None:
        return jsonify(error='Event not found.'), 404
    if count:
        return jsonify(error='Cannot delete an event with student registrations.'), 409
    return jsonify(message='Event deleted.', eventId=eid)

@app.route('/api/recruitments')
def recruitments():
    # Return all stored properties without guessing the schema's field names.
    rows = read_query('''
        MATCH (r:Recruitment)
        OPTIONAL MATCH (c:Club)-[:HAS_RECRUITMENT]->(r)
        OPTIONAL MATCH (student:Student)-[:APPLIED_FOR]->(r)
        RETURN properties(r) AS properties, c.clubName AS clubName, count(DISTINCT student) AS applicants
        ORDER BY properties.recruitmentId
    ''')
    output = []
    for row in rows:
        props = json_safe(row['properties'])
        output.append({
            **props,
            'clubName': row['clubName'],
            'title': props.get('recruitmentTitle') or props.get('recruitmentName') or props.get('title') or props.get('role') or props.get('position'),
            'deadline': props.get('deadline') or props.get('lastDate') or props.get('endDate') or props.get('applicationDeadline'),
            'status': props.get('status') or props.get('recruitmentStatus'),
            'applicants': row['applicants'],
        })
    return jsonify(output)


def recruitment_payload():
    data = request.get_json(silent=True) or {}
    result = {
        'recruitmentTitle': str(data.get('recruitmentTitle') or '').strip(),
        'clubId': str(data.get('clubId') or '').strip().upper(),
        'team': str(data.get('team') or '').strip(),
        'eligibility': str(data.get('eligibility') or '').strip(),
        'startDate': str(data.get('startDate') or '').strip(),
        'endDate': str(data.get('endDate') or '').strip(),
    }
    try:
        start = date.fromisoformat(result['startDate'])
        end = date.fromisoformat(result['endDate'])
    except ValueError:
        return None, 'Enter valid start and end dates.'
    if end < start:
        return None, 'Deadline cannot be before the start date.'
    if not all(result.values()):
        return None, 'All recruitment fields are required.'
    if any(len(result[key]) > 150 for key in ('recruitmentTitle', 'team', 'eligibility')):
        return None, 'Recruitment text fields must be 150 characters or shorter.'
    result['status'] = 'Upcoming' if start > date.today() else ('Closed' if end < date.today() else 'Open')
    result['year'] = start.year
    return result, None


@app.route('/api/recruitments', methods=['POST'])
def create_recruitment():
    data, error = recruitment_payload()
    if error:
        return jsonify(error=error), 400
    rid = str((request.get_json(silent=True) or {}).get('recruitmentId') or '').strip().upper()
    if not rid or len(rid) > 30:
        return jsonify(error='Recruitment ID is required (e.g. R004).'), 400
    with driver.session(database=DATABASE) as session:
        if not session.run('MATCH (c:Club {clubId:$clubId}) RETURN c', clubId=data['clubId']).single():
            return jsonify(error='Selected club does not exist.'), 404
        if session.run('MATCH (r:Recruitment {recruitmentId:$rid}) RETURN r', rid=rid).single():
            return jsonify(error='Recruitment ID already exists.'), 409
        record = session.run('''
            MATCH (c:Club {clubId:$clubId})
            CREATE (r:Recruitment {recruitmentId:$rid, recruitmentTitle:$recruitmentTitle,
              team:$team, eligibility:$eligibility, startDate:$startDate, endDate:$endDate,
              status:$status, year:$year})
            CREATE (c)-[:HAS_RECRUITMENT]->(r)
            RETURN properties(r) AS recruitment
        ''', rid=rid, **data).single()
    return jsonify(json_safe(record['recruitment'])), 201


@app.route('/api/recruitments/<recruitment_id>', methods=['PUT'])
def update_recruitment(recruitment_id):
    data, error = recruitment_payload()
    if error:
        return jsonify(error=error), 400
    rid = recruitment_id.strip().upper()
    with driver.session(database=DATABASE) as session:
        if not session.run('MATCH (c:Club {clubId:$clubId}) RETURN c', clubId=data['clubId']).single():
            return jsonify(error='Selected club does not exist.'), 404
        record = session.run('''
            MATCH (r:Recruitment {recruitmentId:$rid})
            MATCH (c:Club {clubId:$clubId})
            OPTIONAL MATCH (old:Club)-[link:HAS_RECRUITMENT]->(r)
            DELETE link
            MERGE (c)-[:HAS_RECRUITMENT]->(r)
            SET r.recruitmentTitle=$recruitmentTitle, r.team=$team,
                r.eligibility=$eligibility, r.startDate=$startDate,
                r.endDate=$endDate, r.status=$status, r.year=$year
            RETURN properties(r) AS recruitment
        ''', rid=rid, **data).single()
    if record is None:
        return jsonify(error='Recruitment not found.'), 404
    return jsonify(json_safe(record['recruitment']))


@app.route('/api/recruitments/<recruitment_id>', methods=['DELETE'])
def delete_recruitment(recruitment_id):
    rid = recruitment_id.strip().upper()
    with driver.session(database=DATABASE) as session:
        record = session.run('''
            MATCH (r:Recruitment {recruitmentId:$rid})
            OPTIONAL MATCH (:Student)-[a:APPLIED_FOR]->(r)
            WITH r, count(a) AS applications
            RETURN applications
        ''', rid=rid).single()
        if record is None:
            return jsonify(error='Recruitment not found.'), 404
        if record['applications']:
            return jsonify(error='Cannot delete a recruitment with applications. Preserve student records.'), 409
        session.run('MATCH (r:Recruitment {recruitmentId:$rid}) DETACH DELETE r', rid=rid).consume()
    return jsonify(message='Recruitment deleted.', recruitmentId=rid)


@app.route('/api/recruitment-applications', methods=['POST'])
def apply_recruitment():
    data = request.get_json(silent=True) or {}
    reg = str(data.get('registrationNo') or '').strip().upper()
    recruitment_id = str(data.get('recruitmentId') or '').strip()
    if not reg or not recruitment_id:
        return jsonify(error='Student and recruitment ID are required.'), 400
    with driver.session(database=DATABASE) as session:
        def create_application(tx):
            record = tx.run('''
                OPTIONAL MATCH (s:Student {registrationNo:$reg})
                OPTIONAL MATCH (r:Recruitment {recruitmentId:$rid})
                RETURN s IS NOT NULL AS studentFound, r IS NOT NULL AS recruitmentFound,
                       CASE WHEN r IS NULL THEN null ELSE coalesce(r.status, r.recruitmentStatus, 'Open') END AS status,
                       CASE WHEN r IS NULL THEN null ELSE toString(r.startDate) END AS startDate,
                       CASE WHEN r IS NULL THEN null ELSE toString(coalesce(r.deadline, r.lastDate, r.endDate, r.applicationDeadline)) END AS deadline
            ''', reg=reg, rid=recruitment_id).single()
            if not record['studentFound'] or not record['recruitmentFound']:
                return {'error': 'Student or recruitment not found.'}, 404
            if str(record['status']).strip().lower() in ('closed', 'inactive', 'completed'):
                return {'error': 'This recruitment is closed.'}, 409
            start_date = record['startDate']
            if start_date:
                try:
                    if date.fromisoformat(start_date[:10]) > date.today():
                        return {'error': 'Applications have not opened yet.'}, 409
                except ValueError:
                    return {'error': 'Recruitment start date is invalid.'}, 400
            deadline = record['deadline']
            if deadline and len(deadline) >= 10:
                try:
                    if date.fromisoformat(deadline[:10]) < date.today():
                        return {'error': 'The application deadline has passed.'}, 409
                except ValueError:
                    pass
            result = tx.run('''
                MATCH (s:Student {registrationNo:$reg})
                MATCH (r:Recruitment {recruitmentId:$rid})
                MERGE (s)-[a:APPLIED_FOR]->(r)
                ON CREATE SET a.appliedAt = datetime(), a.status = 'Pending'
                RETURN s.registrationNo AS registrationNo, r.recruitmentId AS recruitmentId,
                       a.status AS status
            ''', reg=reg, rid=recruitment_id).single()
            return result.data(), 200
        result, status = session.execute_write(create_application)
    return jsonify(result), status


@app.route('/api/graph')
def graph():
    node_rows = read_query('''
        MATCH (n)
        RETURN elementId(n) AS id, labels(n) AS labels, properties(n) AS properties
        ORDER BY id
    ''')
    link_rows = read_query('''
        MATCH (a)-[r]->(b)
        RETURN elementId(a) AS source, elementId(b) AS target, type(r) AS type
    ''')
    nodes = []
    for row in node_rows:
        props = row['properties']
        label = next((x for x in ('Student', 'Club', 'Event', 'Recruitment', 'Department', 'Certificate') if x in row['labels']), row['labels'][0] if row['labels'] else 'Node')
        name = props.get('name') or props.get('clubName') or props.get('eventName') or props.get('recruitmentTitle') or props.get('recruitmentName') or props.get('registrationNo') or props.get('recruitmentId') or props.get('departmentName') or props.get('certificateName') or label
        nodes.append({'id': row['id'], 'label': label, 'name': str(name)})
    return jsonify({'nodes': nodes, 'links': link_rows})


@app.route('/api/departments')
def departments():
    return jsonify(json_safe(read_query("MATCH (n:Department) RETURN properties(n) AS properties")))


@app.route('/api/certificates')
def certificates():
    return jsonify(json_safe(read_query("MATCH (n:Certificate) RETURN properties(n) AS properties")))


@app.route('/api/relationships')
def relationships():
    rows = read_query('''
        MATCH (a)-[r]->(b)
        RETURN labels(a) AS fromLabels, properties(a) AS fromProperties,
               type(r) AS relationship, labels(b) AS toLabels,
               properties(b) AS toProperties
        ORDER BY relationship
    ''')
    return jsonify(json_safe(rows))



@app.route('/api/memberships', methods=['POST'])
def join_club():
    data = request.get_json(silent=True) or {}
    reg = str(data.get('registrationNo') or '').strip().upper()
    club_id = str(data.get('clubId') or '').strip()
    if not reg or not club_id:
        return jsonify(error='Student and club are required.'), 400
    with driver.session(database=DATABASE) as session:
        record = session.run('''
            OPTIONAL MATCH (s:Student {registrationNo:$reg})
            OPTIONAL MATCH (c:Club {clubId:$club_id})
            RETURN s IS NOT NULL AS studentFound, c IS NOT NULL AS clubFound
        ''', reg=reg, club_id=club_id).single()
        if not record['studentFound'] or not record['clubFound']:
            return jsonify(error='Student or club not found.'), 404
        record = session.run('''
            MATCH (s:Student {registrationNo:$reg})
            MATCH (c:Club {clubId:$club_id})
            MERGE (s)-[r:MEMBER_OF]->(c)
            RETURN s.registrationNo AS registrationNo, c.clubId AS clubId
        ''', reg=reg, club_id=club_id).single()
    return jsonify(record.data())


@app.route('/api/event-registrations', methods=['POST'])
def register_for_event():
    data = request.get_json(silent=True) or {}
    reg = str(data.get('registrationNo') or '').strip().upper()
    event_id = str(data.get('eventId') or '').strip()
    if not reg or not event_id:
        return jsonify(error='Student and event are required.'), 400
    with driver.session(database=DATABASE) as session:
        record = session.run('''
            OPTIONAL MATCH (s:Student {registrationNo:$reg})
            OPTIONAL MATCH (e:Event {eventId:$event_id})
            RETURN s IS NOT NULL AS studentFound, e IS NOT NULL AS eventFound
        ''', reg=reg, event_id=event_id).single()
        if not record['studentFound'] or not record['eventFound']:
            return jsonify(error='Student or event not found.'), 404
        record = session.run('''
            MATCH (s:Student {registrationNo:$reg})
            MATCH (e:Event {eventId:$event_id})
            MERGE (s)-[:REGISTERED_FOR]->(e)
            RETURN s.registrationNo AS registrationNo, e.eventId AS eventId
        ''', reg=reg, event_id=event_id).single()
    return jsonify(record.data())

if __name__ == '__main__':
    driver.verify_connectivity()
    print('Successfully connected to Neo4j!')
    app.run(debug=False, port=5000)
