import os
from dotenv import load_dotenv
import psycopg2
import psycopg2.extras

load_dotenv()
conn = psycopg2.connect(os.getenv("DATABASE_URL"))
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

cur.execute("""
    SELECT lr.status, lr.start_date, lr.end_date, lb.balance, lt.name
    FROM leave_request lr
    JOIN leave_balance lb ON lb.employee_id = lr.employee_id AND lb.leave_type_id = lr.leave_type_id
    JOIN leave_type lt ON lt.id = lr.leave_type_id
    WHERE lr.status = 'approved'
    ORDER BY lr.updated_at DESC
    LIMIT 5;
""")
for r in cur.fetchall():
    print(dict(r))

cur.close()
conn.close()
