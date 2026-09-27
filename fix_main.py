import pathlib
p = pathlib.Path('app/main.py')
content = p.read_text()
content = content.replace(
    'from app.routes import auth, company, department, designation, employee, attendance, leave, shift, platform, dashboard, announcement, overtime, audit, role, expense, site, payroll, action_tracker',
    'from app.routes import auth, company, department, designation, employee, attendance, leave, shift, platform, dashboard, announcement, overtime, audit, role, expense, site, payroll, action_tracker, helpdesk'
)
content = content.replace(
    'app.include_router(action_tracker.router)',
    'app.include_router(action_tracker.router)\napp.include_router(helpdesk.router)'
)
p.write_text(content)
print('main.py updated')
