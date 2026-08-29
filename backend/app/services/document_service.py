"""Document generation service — renders Payslip/Offer Letter/Relieving
Letter PDFs on-the-fly using Jinja2 + xhtml2pdf. Nothing here is persisted
as a file; only the *_record models (for offer/relieving) store the input
data, not the rendered PDF bytes."""

import calendar
from decimal import Decimal
from io import BytesIO
from uuid import UUID

from jinja2 import Environment, FileSystemLoader
from num2words import num2words
from sqlalchemy.orm import Session
from xhtml2pdf import pisa

from app.models.payslip import Payslip
from app.repositories.base import BaseRepository

_env = Environment(loader=FileSystemLoader("app/templates/documents"))


def _amount_in_words(amount: Decimal) -> str:
    rupees = int(amount)
    words = num2words(rupees, lang="en").replace(",", "").title()
    return f"Rupees {words} Only"


def _mask_account_number(account_number: str | None) -> str:
    if not account_number or len(account_number) < 4:
        return "-"
    return f"**** **** {account_number[-4:]}"


def _render_to_pdf(template_name: str, context: dict) -> bytes:
    template = _env.get_template(template_name)
    html = template.render(**context)
    buffer = BytesIO()
    result = pisa.CreatePDF(html, dest=buffer)
    if result.err:
        raise ValueError(f"PDF generation failed for {template_name}")
    return buffer.getvalue()


def generate_payslip_pdf(db: Session, company_id: UUID, payslip_id: UUID) -> bytes | None:
    """Fetch a payslip (company-scoped) and render it as a PDF. Returns
    None if the payslip doesn't exist under this company."""
    repo = BaseRepository(Payslip, db, company_id)
    payslip = repo.get_by_id(payslip_id)
    if not payslip:
        return None

    employee = payslip.employee
    company = employee.company
    run = payslip.payroll_run

    last_day = calendar.monthrange(run.year, run.month)[1]
    month_name = calendar.month_name[run.month]
    pay_period = f"01 {month_name} {run.year} - {last_day} {month_name} {run.year}"
    pay_date = f"{last_day} {month_name} {run.year}"

    earnings = [l for l in payslip.lines if l.component_type == "earning"]
    deductions = [l for l in payslip.lines if l.component_type == "deduction"]
    employer_contributions = [l for l in payslip.lines if l.component_type == "employer_cost"]
    employer_total = sum((l.amount for l in employer_contributions), Decimal(0))

    context = {
        "company": company,
        "employee": employee,
        "payslip": payslip,
        "pay_period": pay_period,
        "pay_date": pay_date,
        "date_of_joining": employee.date_of_hire.strftime("%d %b %Y") if employee.date_of_hire else "-",
        "designation_title": employee.designation.title if employee.designation else None,
        "department_name": employee.department.name if employee.department else None,
        "masked_account_number": _mask_account_number(employee.bank_account_number),
        "earnings": earnings,
        "deductions": deductions,
        "employer_contributions": employer_contributions,
        "employer_total": employer_total,
        "paid_days": payslip.working_days - payslip.lop_days,
        "net_pay_in_words": _amount_in_words(payslip.net_pay),
    }
    return _render_to_pdf("payslip.html", context)
