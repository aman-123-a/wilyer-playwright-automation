# =============================================================================
#  Wilyer QA Automation runner image — based on the official Playwright image
#  (browsers + OS deps preinstalled). Build once, run the suite headless
#  anywhere.
#
#  The image tag MUST track the @playwright/test version in package.json.
#  A mismatch makes Playwright re-download browsers at run time, or fail.
#
#  Build:  docker build -f docker/Dockerfile -t wilyer-qa .
#  Run:    docker run --rm \
#            -e TEST_ENV=cms2 -e CMS_ADMIN_EMAIL -e CMS_ADMIN_PASSWORD \
#            -v "$PWD/reports:/app/reports" wilyer-qa
# =============================================================================
FROM mcr.microsoft.com/playwright:v1.62.0-noble

WORKDIR /app

# Dependency layer — cached until the manifests actually change.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Source layer.
COPY . .

# Default target; override per run with -e TEST_ENV=cms3.
ENV CI=true \
    TEST_ENV=cms2

ENTRYPOINT ["npx", "playwright", "test"]
CMD ["--grep", "@regression"]
