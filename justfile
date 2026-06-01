dev:
    npm run dev

reset-db:
    rm -f data/mountain-weather-tracker.sqlite

install:
    npm install --ignore-scripts
    npm rebuild

test:
    npm test

lint:
    npm run lint

typecheck:
    npm run typecheck

check:
    npm run check

reset-for-agents:
    rm -r .worktrees
    git worktree prune

run-parallel:
    ./scripts/run-parallel.sh