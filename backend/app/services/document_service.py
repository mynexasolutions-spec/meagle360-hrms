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


def generate_offer_letter_pdf(db: Session, company_id: UUID, offer_id: UUID) -> bytes | None:
    """Fetch an OfferLetterRecord (company-scoped) and render it as a PDF."""
    from app.models.offer_letter_record import OfferLetterRecord
    repo = BaseRepository(OfferLetterRecord, db, company_id)
    offer = repo.get_by_id(offer_id)
    if not offer:
        return None

    from app.models.company import Company
    company = db.query(Company).filter(Company.id == company_id).first()

    context = {
        "company": company,
        "offer": offer,
        "issue_date": offer.created_at.strftime("%d %B %Y"),
        "first_name": offer.candidate_name.split()[0] if offer.candidate_name else "",
        "designation_title": offer.designation.title if offer.designation else None,
        "department_name": offer.department.name if offer.department else None,
        "reporting_to_name": offer.reporting_to.full_name if offer.reporting_to else None,
        "site_name": offer.site.name if offer.site else None,
        "start_date": offer.start_date.strftime("%d %B %Y"),
        "end_date": offer.end_date.strftime("%d %B %Y") if offer.end_date else None,
        "acceptance_deadline": offer.acceptance_deadline.strftime("%d %B %Y") if offer.acceptance_deadline else None,
    }
    return _render_to_pdf("offer_letter.html", context)


def generate_relieving_letter_pdf(db: Session, company_id: UUID, relieving_id: UUID) -> bytes | None:
    """Fetch a RelievingLetterRecord (company-scoped) and render it as a PDF."""
    from app.models.relieving_letter_record import RelievingLetterRecord
    repo = BaseRepository(RelievingLetterRecord, db, company_id)
    relieving = repo.get_by_id(relieving_id)
    if not relieving:
        return None

    from app.models.company import Company
    company = db.query(Company).filter(Company.id == company_id).first()
    employee = relieving.employee

    context = {
        "company": company,
        "employee": employee,
        "relieving": relieving,
        "issue_date": relieving.created_at.strftime("%d %B %Y"),
        "first_name": employee.full_name.split()[0] if employee.full_name else "",
        "designation_title": employee.designation.title if employee.designation else None,
        "department_name": employee.department.name if employee.department else None,
        "date_of_joining": employee.date_of_hire.strftime("%d %B %Y") if employee.date_of_hire else "-",
        "last_working_date": relieving.last_working_date.strftime("%d %B %Y"),
    }
    return _render_to_pdf("relieving_letter.html", context)
