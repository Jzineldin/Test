"""Demo CLI for the submission triage agent.

Usage:
    python -m app.cli demo data/submissions/acme_plumbing.json
    python -m app.cli demo data/submissions/acme_plumbing.json --live   # uses real Claude
"""
from __future__ import annotations

from pathlib import Path

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from .agent import load_carriers, triage_submission
from .llm import get_client
from .parsers import get_parser

app = typer.Typer(help="Submission triage agent demo CLI.")
console = Console()

DEFAULT_CARRIERS = Path(__file__).resolve().parents[2] / "data" / "carriers"


@app.command()
def demo(
    submission_path: Path = typer.Argument(..., exists=True, readable=True),
    carriers_dir: Path = typer.Option(DEFAULT_CARRIERS, help="Directory of carrier JSONs"),
    live: bool = typer.Option(False, help="Use real Anthropic API (needs ANTHROPIC_API_KEY)"),
    score_threshold: float = typer.Option(0.5, help="Minimum score for email drafting"),
) -> None:
    """Triage a single submission and print the result."""
    parser = get_parser(submission_path)
    submission = parser.parse(submission_path)
    carriers = load_carriers(carriers_dir)
    llm = get_client(live=live)

    console.rule(f"[bold cyan]Triaging {submission.submission_id}[/bold cyan]")
    console.print(
        f"Insured: [bold]{submission.insured.legal_name}[/bold]  "
        f"({submission.insured.naics} / {submission.insured.primary_state})"
    )
    console.print(f"Carriers loaded: {len(carriers)}    LLM: {type(llm).__name__}")

    result = triage_submission(submission, carriers, llm=llm, score_threshold=score_threshold)

    table = Table(title="Appetite Matches", show_lines=True)
    table.add_column("Carrier", style="bold")
    table.add_column("Score", justify="right")
    table.add_column("Quote-back", justify="right")
    table.add_column("Rationale")
    table.add_column("Risk Flags", style="yellow")

    for match in result.matches:
        table.add_row(
            match.carrier_name,
            f"{match.score:.2f}",
            f"{match.typical_quote_back_days}d",
            match.rationale,
            "\n".join(match.risk_flags) or "-",
        )
    console.print(table)

    console.rule("[bold cyan]Drafted Submission Emails[/bold cyan]")
    if not result.drafted_emails:
        console.print("[yellow]No emails drafted (no carriers above score threshold).[/yellow]")
    for draft in result.drafted_emails:
        console.print(Panel.fit(
            f"[bold]To:[/bold] {draft.to}\n"
            f"[bold]Subject:[/bold] {draft.subject}\n"
            f"[bold]Attachments:[/bold] {', '.join(draft.attachments)}\n\n"
            f"{draft.body}",
            title=draft.carrier_id,
            border_style="green",
        ))

    console.rule("[bold cyan]Triage Summary[/bold cyan]")
    console.print(result.summary)


if __name__ == "__main__":
    app()
