import os
from dotenv import load_dotenv
import psycopg2
import psycopg2.extras

load_dotenv()
conn = psycopg2.connect(os.getenv("DATABASE_URL"))
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

cur.execute("""
    SELECT lb.balance, lb.year, lt.name, lr.status, lr.start_date, lr.end_date
    FROM leave_balance lb
    JOIN leave_type lt ON lt.id = lb.leave_type_id
    LEFT JOIN leave_request lr ON lr.leave_type_id = lb.leave_type_id AND lr.employee_id = lb.employee_id
    WHERE lb.employee_id = '6c25ed91-af39-482b-89b1-bdb3cbf3ff98'
    AND lt.name = 'Personal Leave';
""")
for r in cur.fetchall():
    print(dict(r))

cur.close()
conn.close()
