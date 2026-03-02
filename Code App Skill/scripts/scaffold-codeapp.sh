#!/bin/bash

# Exit on error, undefined vars, and pipe failures
set -euo pipefail

# --- Configuration & Variables ---
APP_DISPLAY_NAME=""
SKILL_PATH=$(cd "$(dirname "$0")" && pwd)
PORT=5173

# --- Helper Functions ---
error_exit() {
    echo -e "\n❌ Error: $1" >&2
    exit 1
}

usage() {
    echo "Usage: $0 --app-name \"<appDisplayName>\""
    exit 1
}

# --- Parse CLI arguments ---
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --app-name) 
            APP_DISPLAY_NAME="${2:-}"
            shift 2 
            ;;
        *) 
            echo "Unknown parameter passed: $1"
            usage 
            ;;
    esac
done

# Validate input
if [[ -z "$APP_DISPLAY_NAME" ]]; then
    error_exit "Missing --app-name parameter.\nUsage: $0 --app-name \"<appDisplayName>\""
fi

# --- Auto-discover active environment from pac env list ---
echo -e "\n🔍 Discovering active Power Platform environment..."
PAC_ENV_OUTPUT=$(pac env list 2>&1) || error_exit "Failed to run 'pac env list'. Is PAC CLI authenticated? Run 'pac auth create' first."

# Extract the line marked as active (starts with *)
ACTIVE_LINE=$(echo "$PAC_ENV_OUTPUT" | awk '/^\*/ {print}')

if [[ -z "$ACTIVE_LINE" ]]; then
    error_exit "No active environment found in 'pac env list' (no line marked with *). Run 'pac env select' to set one."
fi

# Fields: * DisplayName EnvironmentID EnvironmentURL UniqueName
# $1=*  $2=DisplayName (may be multiple words — use awk with known GUID pattern for robustness)
ENVIRONMENT_ID=$(echo "$ACTIVE_LINE" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
DATAVERSE_URL=$(echo "$ACTIVE_LINE" | grep -oE 'https://[^ ]+' | head -1)
ACTIVE_ENV_NAME=$(echo "$ACTIVE_LINE" | awk '{
    # Remove the leading *, then find the text before the GUID
    for(i=2; i<=NF; i++) {
        if ($i ~ /^[0-9a-f]{8}-/) break;
        name = name (name ? " " : "") $i
    }
    print name
}')

if [[ -z "$ENVIRONMENT_ID" ]]; then
    error_exit "Could not parse Environment ID from active environment line:\n  $ACTIVE_LINE"
fi
if [[ -z "$DATAVERSE_URL" ]]; then
    error_exit "Could not parse Environment URL from active environment line:\n  $ACTIVE_LINE"
fi

echo "   ✅ Active Environment : $ACTIVE_ENV_NAME"
echo "   ✅ Environment ID     : $ENVIRONMENT_ID"
echo "   ✅ Dataverse URL      : $DATAVERSE_URL"

echo ""
echo "=========================================="
echo "🚀 Scaffolding Power Apps Code App"
echo "   App Display Name: $APP_DISPLAY_NAME"
echo "   Environment ID:   $ENVIRONMENT_ID"
echo "   Dataverse URL:    $DATAVERSE_URL"
echo "=========================================="

echo -e "\nStep 1: Running degit to scaffold from template..."
npx degit github:microsoft/PowerAppsCodeApps/templates/vite . --force || error_exit "Step 1 failed."

echo -e "\nStep 1.1: Provisioning scripts..."
cp -R "$SKILL_PATH" . || error_exit "Step 1.1 failed."

echo -e "\nStep 2: Installing SDK dependencies..."
npm install || error_exit "Step 2 failed."
npm install @microsoft/power-apps || error_exit "Step 2.1: Installing @microsoft/power-apps failed."

# Persist Dataverse URL for provisioning scripts
echo "{ \"DATAVERSE_URL\": \"$DATAVERSE_URL\" }" > .dataverse-config.json
echo "   ✅ Wrote .dataverse-config.json"

echo -e "\nStep 3: Initializing the code app (npm CLI)..."
npx power-apps init --displayName "$APP_DISPLAY_NAME" --environmentId "$ENVIRONMENT_ID" || error_exit "Step 3 failed."

echo -e "\nStep 4: Starting dev server..."
npm run dev &
DEV_SERVER_PID=$!

echo "⏳ Waiting for server to respond on port $PORT..."
SERVER_UP=false
MAX_WAIT=30

# Loop to check if the server is up using standard curl
for (( i=1; i<=MAX_WAIT; i++ )); do
    # -s: silent, -f: fail silently on server errors, -o /dev/null: discard output
    if curl -s -f -o /dev/null "http://localhost:$PORT"; then
        SERVER_UP=true
        break
    fi
    sleep 1
done

if [ "$SERVER_UP" = true ]; then
    kill "$DEV_SERVER_PID" 2>/dev/null || true
    echo "✅ Server is alive!"
    echo -e "\n✨ Scaffolded and verified successfully"
    echo "   Environment ID : $ENVIRONMENT_ID"
    echo "   Dataverse URL  : $DATAVERSE_URL"
    exit 0
else
    echo "❌ Server timed out or crashed after ${MAX_WAIT} seconds."
    kill "$DEV_SERVER_PID" 2>/dev/null || true
    exit 1
fi