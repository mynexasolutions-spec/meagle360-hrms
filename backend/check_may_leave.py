import os
from dotenv import load_dotenv
import psycopg2
import psycopg2.extras

load_dotenv()
conn = psycopg2.connect(os.getenv("DATABASE_URL"))
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

cur.execute("""
    SELECT lr.id, lr.status, lr.start_date, lr.end_date, lt.id as leave_type_id, lt.name,
           lb.balance, lb.id as balance_id
    FROM leave_request lr
    JOIN leave_type lt ON lt.id = lr.leave_type_id
    LEFT JOIN leave_balance lb ON lb.employee_id = lr.employee_id AND lb.leave_type_id = lr.leave_type_id
    WHERE lr.employee_id = '00034d24-3e17-4467-b21b-223ef91c7f07'
    AND lr.start_date = '2027-05-15';
""")
for r in cur.fetchall():
    print(dict(r))

cur.close()
conn.close()
