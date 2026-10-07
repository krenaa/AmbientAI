from typing import List, Dict, Any, Optional
import re
from app.agent.registry import registry


OUT_OF_SCOPE_PATTERNS = [
    {
        "keywords": ["book flight", "book a flight", "book me a flight", "flight ticket", "airline ticket", "reserve flight"],
        "regex": r"\b(?:book|reserve|find)\s+(?:me\s+)?(?:a\s+)?(?:cheap\s+)?flights?\b",
        "action": "book flights",
        "reason": "I do not have access to commercial airline reservation systems, personal payment credentials, or travel APIs",
        "steps": [
            "Visit flight aggregators like Google Flights (flights.google.com), Skyscanner, or Kayak.",
            "Enter your origin, destination, travel dates, and passenger details.",
            "Compare options and complete booking securely on the airline's official website.",
        ],
        "closest_can_do": "I can use live web search to check flight schedules, travel advisories, or airline baggage policies for you.",
    },
    {
        "keywords": ["book hotel", "book a hotel", "book me a hotel", "reserve hotel", "hotel room", "airbnb reservation"],
        "regex": r"\b(?:book|reserve)\s+(?:me\s+)?(?:a\s+)?hotels?\b",
        "action": "book hotel rooms or lodging",
        "reason": "I do not have access to hotel management platforms or external billing gateways",
        "steps": [
            "Visit hotel booking platforms like Booking.com, Expedia, or Airbnb.",
            "Input your destination city, check-in/check-out dates, and guest count.",
            "Review verified guest ratings and reserve your room directly.",
        ],
        "closest_can_do": "I can search the web for top-rated hotels, amenities, and current neighborhood pricing.",
    },
    {
        "keywords": ["order pizza", "order food", "order me food", "food delivery", "doordash order", "ubereats"],
        "regex": r"\b(?:order|get)\s+(?:me\s+)?(?:a\s+)?(?:pizza|food|burger)\b",
        "action": "order food delivery",
        "reason": "I do not connect to food delivery services or possess merchant checkout capabilities",
        "steps": [
            "Open your preferred delivery app (such as DoorDash, UberEats, or Zomato).",
            "Select your local restaurant and add items to your cart.",
            "Confirm delivery address and finalize payment.",
        ],
        "closest_can_do": "I can search online for restaurant menus, hours of operation, and reviews.",
    },
    {
        "keywords": ["buy product", "order on amazon", "purchase item", "buy stock", "buy crypto"],
        "regex": r"\b(?:buy|purchase)\s+(?:me\s+)?(?:stocks?|crypto|bitcoin|shares?)\b",
        "action": "execute retail purchases or financial trades",
        "reason": "I do not hold payment authorization or brokerage account access",
        "steps": [
            "Log in to your verified retailer or brokerage account.",
            "Verify pricing, shipping options, or trade limits.",
            "Submit order directly via the merchant's secure portal.",
        ],
        "closest_can_do": "I can search current prices, stock quotes, and product specifications across the live web.",
    },
]


def check_graceful_refusal(query: str) -> Optional[str]:
    """Deterministically detects requests outside agent capabilities and produces a helpful refusal."""
    q_lower = query.lower().strip()

    for item in OUT_OF_SCOPE_PATTERNS:
        matches = any(kw in q_lower for kw in item["keywords"])
        if not matches and "regex" in item:
            matches = bool(re.search(item["regex"], q_lower))
        if matches:
            steps_md = "\n".join(f"{idx + 1}. {step}" for idx, step in enumerate(item["steps"]))
            return (
                f"I can't {item['action']} because {item['reason']}.\n\n"
                f"**Here are the concrete steps you can follow:**\n"
                f"{steps_md}\n\n"
                f"> 💡 **What I can do instead**: {item['closest_can_do']}"
            )

    return None


def format_what_can_you_do_summary() -> str:
    """Returns a short, friendly summary of agent capabilities without HITL or execution claims."""
    return (
        "Here is what I can do for you:\n\n"
        "### ⚡ What I can do\n"
        "- **DevOps & Engineering Advisory**: Provide step-by-step guidance, runbooks, deploy commands, and alert drafts for your engineering tasks.\n"
        "- **Live Web Search**: Search the live web for recent articles, real-time facts, and citations.\n"
        "- **Document Knowledge Base (pgvector RAG)**: Analyze and answer questions from your uploaded files and PDFs.\n"
        "- **AST Math & Calculations**: Solve math equations, simple interest (SI), compound interest (CI), and formulas step-by-step.\n"
        "- **Inbox Lookup**: Search and inspect incoming messages and notifications.\n\n"
        "### 🚫 What I cannot do\n"
        "- Execute actions, deploy code, or modify infrastructure directly.\n"
        "- Send live alerts, notifications, or emails directly.\n"
        "- Book commercial flights, hotel rooms, or reserve travel tickets directly.\n"
        "- Order food delivery or make retail e-commerce purchases."
    )


def is_what_can_you_do_query(query: str) -> bool:
    """Checks if user is inquiring about agent capabilities."""
    q_lower = query.lower().strip()
    capability_phrases = [
        "what can you do", "what are your capabilities", "what tools do you have",
        "list your features", "what are you capable of", "help me with what",
        "what modes do you support", "how do you work"
    ]
    return any(p in q_lower for p in capability_phrases)


def build_system_instruction(indexed_docs: Optional[List[Dict[str, Any]]] = None) -> str:
    """Builds the advisor-only system instruction dynamically with tool registry and indexed documents."""
    capabilities_summary = registry.format_capabilities_summary()

    docs_section = "None currently indexed. (Upload files in the Knowledge Base panel to enable document Q&A)"
    if indexed_docs:
        doc_lines = []
        for d in indexed_docs:
            chunks = d.get("chunks_count", 0)
            doc_lines.append(f"- `{d.get('filename', 'Unknown')}` ({chunks} chunks)")
        docs_section = "\n".join(doc_lines)

    return (
        "You are Ambient Agent, an AI assistant for DevOps, engineering and general knowledge questions.\n\n"
        "IMPORTANT: You have NO ability to execute actions. You cannot send messages, deploy code, modify infrastructure, run commands, or contact anyone. You are an advisor only.\n\n"
        "When the user asks you to perform an action (for example: \"send an alert to the team\", \"deploy payments-api v2.1 to staging\", \"restart the server\", \"delete the database\", \"email the client\"):\n\n"
        "1. Do NOT say it was done, sent, triggered or executed. Never use words like \"Simulated\", \"Action executed\" or \"Done\".\n"
        "2. Start with one short line: \"I can't execute this myself, but here's how to do it:\"\n"
        "3. Give clear, numbered steps the user can follow, with example commands or message templates in code blocks where useful.\n"
        "4. If the task is risky (production changes, deletions, deployments, alerts to many people, anything hard to undo), add a short \"Before you do this\" checklist (backup, staging first, rollback plan, who to notify, permissions needed).\n"
        "5. If helpful, end with a ready-to-use draft the user can copy (for example the alert text or the deploy command).\n\n"
        "Keep the tone practical and concise. For normal questions (search, math, document questions, explanations), answer directly as usual.\n\n"
        f"{capabilities_summary}\n\n"
        "### CURRENTLY INDEXED DOCUMENTS IN KNOWLEDGE BASE:\n"
        f"{docs_section}\n\n"
        "### CORE OPERATING PRINCIPLES:\n"
        "1. CAPABILITY HONESTY & ADVISOR ROLE:\n"
        "   - You are purely an advisor. Never pretend to have executed, dispatched, or deployed anything.\n"
        "   - If a user asks for an action outside your capabilities (e.g. booking flights, ordering products), provide concrete steps the user can take.\n"
        "2. DOCUMENT INTEGRITY:\n"
        "   - When answering questions about indexed documents, answer strictly from the retrieved document text.\n"
        "   - If a requested document is not found, state clearly that it is not indexed, list the available documents, and instruct the user to upload it via the Knowledge Base panel.\n"
        "3. WEB SEARCH & CITATIONS:\n"
        "   - When presenting live web search results, always include sources and clickable Markdown links in format `[Source Title](URL)`.\n"
        "4. PRESENTATION & FORMATTING:\n"
        "   - Only include Markdown tables when comparing structured items or metrics.\n"
        "   - Only provide code boxes for real code, commands, or templates.\n"
        "   - Emphasize important terms using inline code or **bold** text."
    )
