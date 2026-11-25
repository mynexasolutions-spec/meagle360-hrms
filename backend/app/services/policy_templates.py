"""Starter policies, published for every company from the start. They must read
as complete for any company, so no blanks to fill in. Admins can edit or delete
them. Lines starting with "## " are headings and "- " are bullets."""

TEMPLATES = [
    {
        "key": "code_of_conduct", "title": "Code of Conduct", "requires_ack": True,
        "body": """## Purpose
This code explains how we are expected to behave at work, with each other, and with our customers and partners.

## What we expect
- Treat everyone with respect, whatever their role or background.
- Be honest in your work, records, claims and reports.
- Follow the law and company policies.
- Protect company property, money and confidential information.

## Conflict of interest
Tell your manager or HR if a personal interest, outside job or relationship could affect your work decisions.

## Gifts
Do not give or accept gifts that could influence a business decision. Check with HR if you are unsure.

## Raising a concern
Report a concern to your manager or HR. We do not allow retaliation against anyone who raises a concern in good faith.

## If the code is broken
Breaches are looked into fairly and may lead to disciplinary action.""",
    },
    {
        "key": "rules_regulations", "title": "Rules & Regulations", "requires_ack": False,
        "body": """## Working hours
- Follow the working hours and days of your assigned shift.
- Record your attendance every working day in the HRMS.

## Workplace behaviour
- Keep the workplace clean and safe.
- Dress neatly and suitably for your role.
- Alcohol, illegal drugs and weapons are not allowed at work. Smoke only in permitted areas.

## Company property
- Use equipment with care and report loss or damage promptly.
- Return all company property on your last working day.

## Visitors and access
- Carry your ID and do not share access cards or passwords.
- Visitors must be registered and accompanied.""",
    },
    {
        "key": "terms_of_employment", "title": "Terms of Employment", "requires_ack": False,
        "body": """## About these terms
These are general terms. Your appointment letter sets out your own terms, and it applies if there is a difference.

## Probation
If you are on probation, its length is stated in your appointment letter.

## Pay
Salary is paid monthly. Payslips are available in the HRMS.

## Notice period
Your notice period is stated in your appointment letter.

## Confidentiality
Keep company, customer and employee information confidential during and after your employment.

## Leaving the company
- Submit your resignation in writing.
- Complete handover and return company property.
- Full and final settlement is processed as required by law.""",
    },
    {
        "key": "leave_attendance", "title": "Leave & Attendance Policy", "requires_ack": False,
        "body": """## Attendance
- Clock in and out each working day.
- Raise a regularization request if an entry is missing or wrong.

## Applying for leave
- Apply in the HRMS before taking leave, with as much notice as you can.
- In an emergency, tell your manager and apply as soon as possible.
- Leave is confirmed only after approval.

## Leave types and balance
Your leave types and current balance are shown on the Leave page.

## Absence without approval
Absence without approval may be treated as loss of pay and may lead to disciplinary action.

## Holidays
Company holidays are listed on the Holidays page.""",
    },
    {
        "key": "posh", "title": "Prevention of Sexual Harassment (POSH)", "requires_ack": True,
        "body": """## Our commitment
Sexual harassment is not tolerated. This policy covers everyone at our workplace, including offices, client sites, work travel, work events and online spaces.

## What is sexual harassment
It includes any unwelcome act or behaviour, such as:
- Physical contact and advances
- A demand or request for sexual favours
- Sexually coloured remarks
- Showing pornography
- Any other unwelcome physical, verbal or non-verbal conduct of a sexual nature

## Internal Committee
Complaints are handled by the company's Internal Committee where one is required by law. Ask HR for the names and contact details of its members.

## How to complain
Send a written complaint to the Internal Committee, or to HR if you are unsure whom to contact, ordinarily within three months of the incident or the last incident. The committee can help you put it in writing and may extend the time limit as the law allows.

## Confidentiality and protection
Complaints are kept confidential. Retaliation against a complainant or witness is not allowed.

## Inquiry and action
The committee looks into each complaint fairly and within the time set by law, and recommends action to the company.""",
    },
    {
        "key": "it_data_security", "title": "IT & Data Security Policy", "requires_ack": False,
        "body": """## Accounts and passwords
- Use strong, unique passwords and never share them.
- Turn on two-step verification where it is available.
- Lock your screen when you step away.

## Devices and software
- Install only approved software.
- Keep devices updated and report loss or theft at once to IT support or HR.

## Data
- Access only the data you need for your work.
- Do not send company or customer data to personal email or storage.
- Handle personal data as the law requires.

## Email and internet
Be careful with unknown links and attachments. Report suspicious messages to IT support.

## Reporting an incident
Report any suspected data leak or security incident immediately.""",
    },
]

BY_KEY = {t["key"]: t for t in TEMPLATES}
