# Keycloak Seeding Requirements

## Purpose
Create a Bun script that seeds a local Keycloak instance with users, realm roles, and groups for the `vuu` realm.

## Target Environment
- Keycloak is running locally at `http://localhost:8080`.
- The `vuu` realm already exists.
- The script runs from the `packages/vuu-demo/scripts` folder and is written for Bun/TypeScript.

## Required Entities

### Users
Create or update these users with the listed email addresses:
- `trader1` -> `trader1@vuu.com`
- `trader2` -> `trader2@vuu.com`
- `dev1` -> `dev1@vuu.com`
- `dev2` -> `dev2@vuu.com`
- `admin` -> `admin@vuu.com`

### Realm Roles
Create these realm roles in the `vuu` realm:
- `basket.view`
- `basket.trade`
- `data.view`
- `users.view`
- `users.admin`

### Groups
Create these groups in the `vuu` realm:
- `BASKET_VIEW`
- `BASKET_TRADE`
- `DATA_VIEW`
- `USERS_VIEW`
- `USERS_ADMIN`

## Group-to-Role Associations
The script must assign realm roles to groups as follows:
- `BASKET_VIEW` -> `basket.view`
- `BASKET_TRADE` -> `basket.view`, `basket.trade`
- `DATA_VIEW` -> `data.view`
- `USERS_VIEW` -> `users.view`
- `USERS_ADMIN` -> `users.view`, `users.admin`

## User-to-Group Associations
The script must add users to groups as follows:
- `trader1` -> `BASKET_TRADE`
- `trader2` -> `BASKET_TRADE`
- `dev1` -> `DATA_VIEW`, `USERS_VIEW`
- `dev2` -> `DATA_VIEW`, `USERS_VIEW`
- `admin` -> `USERS_ADMIN`

## Password Handling
- The script should set a non-temporary password for each user.
- The password should be configurable through an environment variable.
- A sensible default may be used for local development.

## Authentication
- The script must authenticate against Keycloak using the admin API.
- The Keycloak admin username, admin password, base URL, and realm should be configurable through environment variables.
- Defaults should support a local developer setup.

## Idempotency
The script should be safe to run multiple times.
- If a role already exists, do not recreate it.
- If a group already exists, do not recreate it.
- If a user already exists, update its profile as needed instead of duplicating it.
- If a user is already in a group, do not add duplicate membership.
- If a group already has the required roles, do not add duplicates.

## Suggested Environment Variables
- `KEYCLOAK_URL`
- `KEYCLOAK_REALM`
- `KEYCLOAK_ADMIN_USERNAME`
- `KEYCLOAK_ADMIN_PASSWORD`
- `KEYCLOAK_USER_PASSWORD`

## Validation
- The script should be valid TypeScript for Bun.
- A standalone type-check should succeed before use.

## Non-Goals
- Creating the `vuu` realm itself.
- Managing clients, client roles, or protocol mappers.
- Supporting remote or production Keycloak deployment specifics.