# Hotel C – backend

REST API hotelu: portal gościa, panel recepcji i endpointy dla partnerów.
Stos: NestJS, Prisma, PostgreSQL, Swagger (OpenAPI).

Pierwsze uruchomienie całego projektu (baza, backend i frontend) opisuje
[README w katalogu głównym](../README.md#uruchomienie): wystarczą `npm run setup` i `npm start`.
Model danych i reguły biznesowe opisuje dokumentacja projektu 0.3 (link w głównym README).

## Skrypty

Poniższe polecenia uruchamia się w katalogu `backend/`. Zależności backendu instaluje `npm run setup`
z katalogu głównego (albo ręcznie `npm ci` w tym katalogu).

| Komenda                    | Opis                                                          | Wymaga bazy |
| -------------------------- | ------------------------------------------------------------- | ----------- |
| `npm run start:dev`        | Uruchomienie w trybie developerskim (z przeładowaniem)        | tak         |
| `npm run build`            | Kompilacja do katalogu `dist/`                                | nie         |
| `npm run lint`             | Analiza statyczna kodu (oxlint)                               | nie         |
| `npm test`                 | Testy jednostkowe (Vitest)                                    | nie         |
| `npm run test:e2e`         | Testy e2e: walidacja, format błędów, kontrakt (baza jest atrapą) | nie      |
| `npm run test:integration` | Testy na prawdziwym PostgreSQL (osobna baza `hotel_c_test`)   | tak         |
| `npm run db:seed`          | Dane startowe z dokumentacji (typy pokoi, pokoje, rezerwacje)             | tak         |
| `npm run openapi:update`   | Odświeżenie `docs/openapi.yaml` po zmianie DTO lub endpointów | nie         |
