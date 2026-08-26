import os
from dotenv import load_dotenv
import psycopg2
import psycopg2.extras

load_dotenv()
conn = psycopg2.connect(os.getenv("DATABASE_URL"))
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# Employees with a leave_balance record
cur.execute("""
    SELECT lb.employee_id, e.full_name, lb.leave_type_id, lt.name AS leave_type_name,
           lb.balance, lb.year, lt.is_paid, lt.accrual_rate
    FROM leave_balance lb
    JOIN employee e ON e.id = lb.employee_id
    JOIN leave_type lt ON lt.id = lb.leave_type_id
    ORDER BY e.full_name
    LIMIT 20;
""")
rows = cur.fetchall()
for r in rows:
    print(dict(r))

cur.close()
conn.close()
