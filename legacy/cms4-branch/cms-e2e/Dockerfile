# =============================================================================
#  CMS E2E runner image — based on the official Playwright image (browsers +
#  OS deps preinstalled). Build once, run the suite headless anywhere.
#
#  Build:  docker build -t cms-e2e .
#  Run:    docker run --rm -e CMS_ADMIN_EMAIL -e CMS_ADMIN_PASSWORD \
#            -v "$PWD/playwright-report:/app/playwright-report" cms-e2e
# =============================================================================
FROM mcr.microsoft.com/playwright:v1.50.0-jammy

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV CI=true
ENTRYPOINT ["npx", "playwright", "test"]
CMD ["--grep", "@regression"]
