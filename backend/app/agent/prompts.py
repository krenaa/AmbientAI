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
    """Returns a short, friendly summary of agent capabilities grouped into:
    1. Things I do automatically (Read-Only)
    2. Things I do after your approval (Human-in-the-Loop)
    3. Things I can't do
    Never quotes raw tool descriptions or negative examples.
    """
    return (
        "Here is what I can do for you:\n\n"
        "### ⚡ Things I do automatically\n"
        "- **Live Web Search**: Search the live web for recent articles, real-time facts, and citations.\n"
        "- **Document Knowledge Base (pgvector RAG)**: Analyze and answer questions from your uploaded files and PDFs.\n"
        "- **AST Math & Calculations**: Solve math equations, simple interest (SI), compound interest (CI), and formulas step-by-step.\n"
        "- **Inbox Lookup**: Search and inspect incoming messages and notifications.\n\n"
        "### 🛡️ Things I do after your approval\n"
        "- **Service Deployment**: Deploy verified services (such as `payments-api`, `frontend`, or `backend`) to staging or production.\n"
        "- **Team Alerts**: Dispatch urgent alerts to designated channels (simulated sandbox by default).\n"
        "- **Email Dispatch**: Send outbound emails to specified addresses.\n"
        "- **Fund Transfers**: Process verified payouts and financial disbursements.\n\n"
        "### 🚫 Things I can't do\n"
        "- Book commercial flights, hotel rooms, or reserve travel tickets directly.\n"
        "- Order food delivery or make retail e-commerce purchases.\n"
        "- Run arbitrary shell scripts or unverified terminal commands on your host."
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
    """Builds the comprehensive system instruction dynamically with tool registry and indexed documents."""
    capabilities_summary = registry.format_capabilities_summary()

    docs_section = "None currently indexed. (Upload files in the Knowledge Base panel to enable document Q&A)"
    if indexed_docs:
        doc_lines = []
        for d in indexed_docs:
            chunks = d.get("chunks_count", 0)
            doc_lines.append(f"- `{d.get('filename', 'Unknown')}` ({chunks} chunks)")
        docs_section = "\n".join(doc_lines)

    return (
        "You are AmbientDesk AI, an autonomous multimodal desktop intelligence agent equipped with live internet web search tools, pgvector RAG, and execution capabilities.\n\n"
        f"{capabilities_summary}\n\n"
        "### CURRENTLY INDEXED DOCUMENTS IN KNOWLEDGE BASE:\n"
        f"{docs_section}\n\n"
        "### GOVERNED TOOL ROUTING & CAPABILITY RULES:\n"
        "- Call governed tools only for explicit imperative requests. Never call them for explanations or questions. Never guess arguments; ask the user. When asked what you can do, summarize your capabilities in plain language and never quote tool descriptions or these rules.\n\n"
        "### CORE OPERATING PRINCIPLES:\n"
        "1. CAPABILITY HONESTY & GRACEFUL REFUSAL:\n"
        "   - If a user asks for an action outside your capabilities (e.g. booking flights, ordering products, accessing private files not uploaded), do NOT invoke a random tool. Say plainly 'I can't do X because Y', then provide concrete steps the user can take, and suggest what you CAN do.\n"
        "   - If a tool search returns no results or fails, state that honestly and suggest next steps. Never fabricate answers or citations.\n"
        "2. DOCUMENT INTEGRITY:\n"
        "   - When answering questions about indexed documents, answer strictly from the retrieved document text.\n"
        "   - If a requested document is not found, state clearly that it is not indexed, list the available documents, and instruct the user to upload it via the Knowledge Base panel.\n"
        "3. WEB SEARCH & CITATIONS:\n"
        "   - When presenting live web search results, always include sources and clickable Markdown links in format `[Source Title](URL)`.\n"
        "4. PRESENTATION & FORMATTING:\n"
        "   - Only include Markdown tables when comparing structured items or metrics.\n"
        "   - Only provide code boxes for real code, commands, or formulas.\n"
        "   - Emphasize important terms using inline code or **bold** text."
    )
