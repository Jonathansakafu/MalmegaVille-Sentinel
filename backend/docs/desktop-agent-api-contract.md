# MalmegaVille Sentinel Desktop Agent API Contract

## Purpose
This document defines the REST contract between the Windows desktop agent and the MalmegaVille Sentinel backend.

## Base URL

- `https://<backend-host>/api`

## Authentication

- All protected endpoints require a Bearer token in `Authorization`.
- The desktop agent registers the device and receives a JWT for future communication.

## Endpoints

### 1. Register device

- `POST /api/devices`
- Request body:
  - `deviceId` (string, required)
  - `name` (string, required)
  - `operatingSystem` (string, required)

- Response:
  - `id`
  - `deviceId`
  - `name`
  - `operatingSystem`
  - `lastSeen`
  - `securityStatus`

### 2. Send incident

- `POST /api/incidents`
- Request body:
  - `deviceId` (string, required)
  - `incidentType` (string, required)
  - `threatScore` (number, required)
  - `severity` (string, required: low | medium | high | critical)
  - `summary` (string, required)
  - `details` (object, optional)

- Response: incident document

### 3. Device list

- `GET /api/devices`
- Returns registered devices for the authenticated user.

### 4. Incident list

- `GET /api/incidents`
- Returns incidents for the authenticated user.

## Security notes

- JWT secrets must be stored in environment variables.
- The desktop agent should only send data to authorized endpoints.
- Sensitive information must be encrypted in transit using HTTPS.
