#!/bin/bash

# Kill process running on specified port
# Usage: killport <port_number>

killport() {
    if [ -z "$1" ]; then
        echo "Usage: killport <port_number>"
        return 1
    fi
    
    local port=$1
    local pids=$(lsof -ti:$port 2>/dev/null)
    
    if [ -n "$pids" ]; then
        echo "$pids" | xargs kill -9 2>/dev/null
        echo "✓ Killed process(es) on port $port"
    else
        echo "No process found on port $port"
    fi
}

# Export the function so it's available in the shell
export -f killport 2>/dev/null || true