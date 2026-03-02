#!/bin/bash
# =============================================================================
# discover-copilot-connection.sh
# Discovery step (Part 1 of 2): Resolve the Microsoft Copilot Studio connectionId.
#
# Behaviour:
#   0 connections found → prompt user to create one, wait, retry (up to 5×)
#   1 connection  found → select it automatically
#   2+ connections found → prompt user to choose by number
#
# Output (stdout, last line):  COPILOT_CONNECTION_ID=<connectionId>
# All human-facing messaging goes to stderr so the agent can parse stdout cleanly.
# =============================================================================

set -euo pipefail

COPILOT_API_ID="shared_microsoftcopilotstudio"
MAX_RETRIES=5

# ---------------------------------------------------------------------------
# Helper: print to stderr (human messages, never parsed by the agent)
# ---------------------------------------------------------------------------
info() { echo -e "$*" >&2; }
hr()   { info "──────────────────────────────────────────────────────────"; }

# ---------------------------------------------------------------------------
# Helper: filter pac connection list output for Copilot Studio rows
# ---------------------------------------------------------------------------
get_matching_connections() {
    pac connection list 2>/dev/null \
        | tail -n +2 \
        | grep "$COPILOT_API_ID" \
        | grep -v "^$" || true
}

# ===========================================================================
# Resolve connectionId
# ===========================================================================
hr
info "🔍 Resolving Microsoft Copilot Studio Connection..."
hr

connection_id=""
attempt=0

while [[ $attempt -lt $MAX_RETRIES ]]; do
    attempt=$(( attempt + 1 ))
    info ""
    info "   Running: pac connection list  (attempt $attempt / $MAX_RETRIES)"

    matching=$(get_matching_connections)
    count=$(echo "$matching" | grep -c "." 2>/dev/null || echo 0)

    # ── CASE 1: No connection ────────────────────────────────────────────────
    if [[ $count -eq 0 ]]; then
        info ""
        info "⚠️  No Microsoft Copilot Studio connection was found in your environment."
        info ""
        info "🙋 ACTION REQUIRED — Please create one manually:"
        info ""
        info "   1. Open https://make.powerapps.com"
        info "   2. Go to  Data → Connections"
        info "   3. Click  'New connection'"
        info "   4. Search for  'Microsoft Copilot Studio'  and select it"
        info "   5. Authenticate when prompted and save the connection"
        info ""

        read -r -p "   ➜ Press [Enter] once done (or type 'q' + Enter to quit): " user_input </dev/tty
        if [[ "${user_input,,}" == "q" ]]; then
            info "❌ Aborted by user."
            exit 1
        fi
        continue
    fi

    # ── CASE 2: Exactly one connection ──────────────────────────────────────
    if [[ $count -eq 1 ]]; then
        connection_id=$(echo "$matching" | awk '{print $1}')
        conn_name=$(echo "$matching" | awk '{$1=""; $NF=""; print}' | xargs)
        conn_status=$(echo "$matching" | awk '{print $NF}')

        info ""
        info "✅ Found exactly one Copilot Studio connection — selected automatically:"
        info "   Id     : $connection_id"
        info "   Name   : $conn_name"
        info "   Status : $conn_status"
        break
    fi

    # ── CASE 3: Multiple connections ────────────────────────────────────────
    info ""
    info "⚠️  Multiple Microsoft Copilot Studio connections found."
    info ""
    info "🙋 ACTION REQUIRED — Please choose which connection to use:"
    info ""

    declare -a ids=()
    i=1
    while IFS= read -r line; do
        conn_id=$(echo "$line" | awk '{print $1}')
        conn_name=$(echo "$line" | awk '{$1=""; $NF=""; print}' | xargs)
        conn_status=$(echo "$line" | awk '{print $NF}')
        ids+=("$conn_id")

        info "   [$i] Id     : $conn_id"
        info "       Name   : $conn_name"
        info "       Status : $conn_status"
        info ""
        i=$(( i + 1 ))
    done <<< "$matching"

    info "   Reply with a number (e.g. 1) or paste the full Id directly."
    info ""

    read -r -p "   ➜ Your choice: " user_choice </dev/tty

    if [[ "$user_choice" =~ ^[0-9]+$ ]]; then
        idx=$(( user_choice - 1 ))
        if [[ $idx -lt 0 || $idx -ge ${#ids[@]} ]]; then
            info "❌ Invalid number. Please run the script again."
            exit 1
        fi
        connection_id="${ids[$idx]}"
    else
        connection_id=""
        for id in "${ids[@]}"; do
            if [[ "$id" == "$user_choice" ]]; then
                connection_id="$id"
                break
            fi
        done
        if [[ -z "$connection_id" ]]; then
            info "❌ The Id you entered was not in the list. Please run the script again."
            exit 1
        fi
    fi

    info ""
    info "✅ Selected: $connection_id"
    break
done

if [[ -z "$connection_id" ]]; then
    info "❌ Maximum retries ($MAX_RETRIES) reached without finding a connection. Aborting."
    exit 1
fi

# ===========================================================================
# OUTPUT — machine-readable, on stdout (last line)
# ===========================================================================
hr
info "✅ Connection resolved. Returning connectionId to agent."
hr

echo "COPILOT_CONNECTION_ID=$connection_id"
