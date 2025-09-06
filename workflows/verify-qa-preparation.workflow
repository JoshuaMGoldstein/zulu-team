FROM clone-project

ARG ACCOUNT_ID
ARG PROJECT_NAME
ARG BRANCH_NAME

USER git
WORKDIR /workspace/${PROJECT_NAME}

# Validate required arguments
RUN if [ -z "$ACCOUNT_ID" ]; then echo "No account ID provided" && exit 1; fi
RUN if [ -z "$PROJECT_NAME" ]; then echo "No project name provided" && exit 1; fi
RUN if [ -z "$BRANCH_NAME" ]; then echo "No branch name provided" && exit 1; fi

# Check for Dockerfile
RUN if [ ! -f "Dockerfile" ]; then echo "ERROR: Dockerfile not found in repository root" && exit 1; fi
RUN echo "✅ Dockerfile found"

# Check for .gitignore
RUN if [ ! -f ".gitignore" ]; then echo "ERROR: .gitignore not found in repository root" && exit 1; fi
RUN echo "✅ .gitignore found"

# Check for radsuite-metadata branch and required files
RUN git fetch origin radsuite-metadata:radsuite-metadata || echo "⚠️  radsuite-metadata branch not found"
RUN if git show-ref --verify --quiet refs/heads/radsuite-metadata; then \
        echo "✅ radsuite-metadata branch exists"; \
        if [ ! -f "ROADMAP.md" ]; then echo "⚠️  ROADMAP.md not found in radsuite-metadata branch"; fi; \
        if [ ! -f "DEPLOY.md" ]; then echo "⚠️  DEPLOY.md not found in radsuite-metadata branch"; fi; \
    else \
        echo "⚠️  radsuite-metadata branch does not exist"; \
    fi

# Validate Dockerfile basic structure
RUN if ! grep -q "FROM" Dockerfile; then echo "ERROR: Dockerfile missing FROM instruction" && exit 1; fi
RUN if ! grep -q "EXPOSE" Dockerfile; then echo "WARNING: Dockerfile missing EXPOSE instruction" && echo "Consider adding EXPOSE instruction for clarity"; fi

# Check .gitignore for common security patterns
RUN if ! grep -q "\.env" .gitignore; then echo "WARNING: .gitignore does not include .env files" && echo "Consider adding .env to .gitignore for security"; fi
RUN if ! grep -q "node_modules" .gitignore; then echo "WARNING: .gitignore does not include node_modules" && echo "Consider adding node_modules to .gitignore"; fi

# Verify branch is ready for deployment
RUN echo "QA preparation verification completed for ${PROJECT_NAME} on branch ${BRANCH_NAME}"