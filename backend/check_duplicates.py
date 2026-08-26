import os
from dotenv import load_dotenv
import psycopg2

load_dotenv()
conn = psycopg2.connect(os.getenv("DATABASE_URL"))
cur = conn.cursor()
cur.execute("""
    SELECT employee_id, leave_type_id, year, COUNT(*) 
    FROM leave_balance 
    GROUP BY employee_id, leave_type_id, year 
    HAVING COUNT(*) > 1;
""")
rows = cur.fetchall()
if rows:
    print(f"DUPLICATES FOUND: {len(rows)} groups")
    for r in rows:
        print(r)
else:
    print("No duplicates found.")
cur.close()
conn.close()
