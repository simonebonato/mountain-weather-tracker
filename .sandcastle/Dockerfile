FROM node:22-bookworm

RUN apt-get update && apt-get install -y \
  git \
  curl \
  jq \
  ripgrep \
  && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI (needed if using github-issues backlog mode)
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
  && apt-get update && apt-get install -y gh \
  && rm -rf /var/lib/apt/lists/*

# UID/GID alignment — sandcastle docker build-image passes these automatically
ARG AGENT_UID=1000
ARG AGENT_GID=1000

# Skip groupmod if the GID already exists in the image (e.g. macOS staff=20)
RUN if ! getent group $AGENT_GID > /dev/null 2>&1; then \
      groupmod -g $AGENT_GID node; \
    fi \
  && usermod -u $AGENT_UID -g $AGENT_GID -d /home/agent -m -l agent node

# Install just (command runner used by project justfiles)
RUN curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash -s -- --to /usr/local/bin

# Install Codex as root before switching to agent user
RUN npm install -g @openai/codex

USER ${AGENT_UID}:${AGENT_GID}

WORKDIR /home/agent

ENTRYPOINT ["sleep", "infinity"]
