FROM scratch

ARG ACCOUNT_ID
ARG PROJECT_NAME

USER git
WORKDIR /workspace/${PROJECT_NAME}-metadata

# Validate required arguments
RUN if [ -z "$ACCOUNT_ID" ]; then echo "No account ID provided" && exit 1; fi
RUN if [ -z "$PROJECT_NAME" ]; then echo "No project name provided" && exit 1; fi

# Verify we're on the radsuite-metadata branch
RUN if [ "$(git rev-parse --abbrev-ref HEAD)" != "radsuite-metadata" ]; then \
        echo "ERROR: Not on radsuite-metadata branch" && exit 1; \
    fi

# Create ROADMAP.md if it doesn't exist
RUN if [ ! -f "ROADMAP.md" ]; then \
        echo "# Project Roadmap" > ROADMAP.md && \
        echo "" >> ROADMAP.md && \
        echo "## Current Sprint" >> ROADMAP.md && \
        echo "- [ ] Task 1" >> ROADMAP.md && \
        echo "- [ ] Task 2" >> ROADMAP.md && \
        echo "" >> ROADMAP.md && \
        echo "## Next Sprint" >> ROADMAP.md && \
        echo "- [ ] Future task 1" >> ROADMAP.md && \
        echo "- [ ] Future task 2" >> ROADMAP.md; \
    fi

# Create DEPLOY.md if it doesn't exist
RUN if [ ! -f "DEPLOY.md" ]; then \
        echo "# Deployment Guide" > DEPLOY.md && \
        echo "" >> DEPLOY.md && \
        echo "## Environment Configuration" >> DEPLOY.md && \
        echo "- Environment: ${ENVIRONMENT}" >> DEPLOY.md && \
        echo "- Branch: ${BRANCH_NAME}" >> DEPLOY.md && \
        echo "" >> DEPLOY.md && \
        echo "## Deployment Steps" >> DEPLOY.md && \
        echo "1. Build Docker image" >> DEPLOY.md && \
        echo "2. Deploy to Cloud Run" >> DEPLOY.md && \
        echo "3. Run health checks" >> DEPLOY.md && \
        echo "" >> DEPLOY.md && \
        echo "## Notes" >> DEPLOY.md && \
        echo "- Add any deployment-specific notes here" >> DEPLOY.md; \
    fi

# Create QA_CHECKLIST.md if it doesn't exist
RUN if [ ! -f "QA_CHECKLIST.md" ]; then \
        echo "# QA Checklist" > QA_CHECKLIST.md && \
        echo "" >> QA_CHECKLIST.md && \
        echo "## Pre-deployment Checks" >> QA_CHECKLIST.md && \
        echo "- [ ] Dockerfile exists and is valid" >> QA_CHECKLIST.md && \
        echo "- [ ] .gitignore exists and includes sensitive files" >> QA_CHECKLIST.md && \
        echo "- [ ] Application builds successfully" >> QA_CHECKLIST.md && \
        echo "- [ ] Health check endpoint is implemented" >> QA_CHECKLIST.md && \
        echo "- [ ] Environment variables are properly configured" >> QA_CHECKLIST.md && \
        echo "" >> QA_CHECKLIST.md && \
        echo "## Post-deployment Checks" >> QA_CHECKLIST.md && \
        echo "- [ ] Service is accessible via URL" >> QA_CHECKLIST.md && \
        echo "- [ ] Health check endpoint responds correctly" >> QA_CHECKLIST.md && \
        echo "- [ ] Application logs show no errors" >> QA_CHECKLIST.md; \
    fi

# Commit metadata files
RUN git add ROADMAP.md DEPLOY.md QA_CHECKLIST.md 2>/dev/null || true
RUN git config user.email "bot@zulu-team.com" && \
    git config user.name "Zulu Team Bot"
RUN git commit -m "Initialize radsuite-metadata branch with project documentation" 2>/dev/null || echo "No changes to commit"

RUN echo "✅ radsuite-metadata branch setup completed for ${PROJECT_NAME}"