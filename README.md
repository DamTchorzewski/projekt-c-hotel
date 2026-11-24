# Hotel C – system obsługi hotelu

Aplikacja webowa hotelu z projektu zespołowego C. Gość sam rezerwuje pobyt w portalu, recepcja obsługuje rezerwacje
i plan pobytu, a hotel współpracuje przez REST API z systemami masaży (A), fitnessu (B) i voucherów (D).

> **Status (24.11.2026):** gotowy jest prototyp wyszukiwarki pokoi (frontend, publikowany jako
> [wersja demo](https://damtchorzewski.github.io/projekt-c-hotel/)) oraz fundament backendu z pierwszymi endpointami.
> Frontend nie korzysta jeszcze z API. Co jest w toku, pokazuje tablica projektu.

## Najważniejsze linki

| Co                        | Gdzie                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| Dokumentacja (wersja 0.3) | [wspólny plik Word na SharePoint][docs] (logowanie kontem uczelnianym)                        |
| Zadania i sprinty         | [tablica projektu](https://github.com/users/DamTchorzewski/projects/2) (dostęp dla zespołu)   |
| Wersja demo               | [damtchorzewski.github.io/projekt-c-hotel](https://damtchorzewski.github.io/projekt-c-hotel/) |
| Kontrakt API              | [docs/openapi.yaml](docs/openapi.yaml), po uruchomieniu także Swagger                         |

Zakres, reguły biznesowe i kontrakt API opisuje dokumentacja. Zmianę zakresu wprowadzamy najpierw w dokumencie,
potem na tablicy, a na końcu w kodzie.

## Nad czym pracujemy

Cel MVP:

- **Portal gościa (bez konta):** katalog typów pokoi, wyszukiwarka z ceną pobytu, rezerwacja z numerem `R-000123`,
  podgląd rezerwacji i oferty partnerów.
- **Panel recepcji:** rezerwacje, plan pobytu z usługami A i B, zameldowanie i wymeldowanie z obsługą vouchera.
- **API dla partnerów:** System D sprawdza dostępność i rezerwuje pobyty z kodem vouchera.
- **Bez overbookingu:** jeden pokój nie może mieć dwóch nakładających się rezerwacji, niezależnie od kanału.

| Epika                         | Historyjki    | Co obejmuje                                                    |
| ----------------------------- | ------------- | -------------------------------------------------------------- |
| E1 Oferta i dostępność        | US-01 – US-03 | ewidencja pokoi, wyszukiwanie wolnych pokoi, wycena, katalog   |
| E2 Portal gościa              | US-04 – US-07 | wyszukiwarka i rezerwacja w portalu, podgląd, oferty partnerów |
| E3 Rezerwacje                 | US-08 – US-12 | rezerwacje recepcji: tworzenie, zmiana, anulowanie, lista      |
| E4 Plan pobytu i partnerzy    | US-13 – US-17 | usługi A/B z pakietu i dodatkowe, odmowy partnerów             |
| E5 Vouchery i obsługa pobytu  | US-18 – US-20 | zameldowanie, wymeldowanie, rozliczenie vouchera               |
| E6 API dla partnerów (D)      | US-21 – US-23 | oferta, dostępność i rezerwacje przez API z kluczem            |
| E7 Fundament techniczny       | US-24 – US-28 | środowisko, CI, adaptery partnerów, logowanie, Swagger         |
| Poza zakresem (Won't)         | US-29 – US-33 | edycja pokoi i cen, pakiety, role i konta, płatności online    |

Razem 33 historyjki: 22 Must, 5 Should, 1 Could i 5 Won't.

## Technologie

| Obszar       | Technologia                                              |
| ------------ | -------------------------------------------------------- |
| Frontend     | React 19, TypeScript, Vite                               |
| Backend      | NestJS, Prisma, PostgreSQL 16, Swagger (OpenAPI)         |
| Testy        | Vitest, React Testing Library, Supertest                 |
| CI i hosting | GitHub Actions, GitHub Pages (wersja demo frontendu)     |

## Uruchomienie

| Co uruchamiasz     | Co musisz mieć                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| Sam frontend       | Git, [Node.js 24](https://nodejs.org), wolny port 5173                                              |
| Frontend + backend | to samo, uruchomiony [Docker Desktop](https://www.docker.com/products/docker-desktop/), wolne porty 3000 i 5432 |

W Dockerze działa tylko baza PostgreSQL. Backend i frontend działają w Node.js.

### Frontend + backend

```bash
git clone https://github.com/DamTchorzewski/projekt-c-hotel.git
cd projekt-c-hotel
git switch develop
npm run setup
npm start
```

`npm run setup` uruchamiasz raz oraz po zmianach zależności lub migracji bazy. Tworzy pliki `.env`, uruchamia bazę,
instaluje zależności i wczytuje dane startowe. Na co dzień wystarcza `npm start`. `Ctrl+C` zatrzymuje backend i frontend,
a bazę zatrzymuje `npm run db:stop`.

| Co sprawdzić     | Adres                                 | Oczekiwany wynik           |
| ---------------- | ------------------------------------- | -------------------------- |
| Frontend         | <http://localhost:5173>               | strona aplikacji           |
| Stan API i bazy  | <http://localhost:3000/api/v1/health> | `status: "ok"`             |
| Dokumentacja API | <http://localhost:3000/api/docs>      | Swagger z listą endpointów |

Lokalne konto recepcji: login `recepcja`, hasło `hotel-dev` (tylko do pracy na własnym komputerze, plik
`backend/.env.example`).

| Polecenie (w katalogu głównym) | Co robi                                             |
| ------------------------------ | --------------------------------------------------- |
| `npm run setup`                | pierwsza konfiguracja                               |
| `npm start`                    | baza, backend i frontend                            |
| `npm test`                     | testy jednostkowe backendu i testy frontendu        |
| `npm run test:integration`     | testy backendu na prawdziwej bazie `hotel_c_test`   |
| `npm run lint`                 | sprawdzenie kodu                                    |
| `npm run build`                | kompilacja backendu i frontendu                     |

### Sam frontend

Bez Dockera i API. Wystarczy do pracy nad wyglądem; dane z backendu nie będą dostępne.

```bash
cd frontend
npm ci
npm run dev
```

### Problemy

| Objaw                                                    | Rozwiązanie                                                             |
| -------------------------------------------------------- | ----------------------------------------------------------------------- |
| `Docker is not running or does not respond`              | uruchom Docker Desktop i poczekaj, aż pokaże „running”                  |
| Docker Desktop nie startuje po nagłym zamknięciu (Windows), w błędzie `The file cannot be accessed by the system` | zamknij Docker Desktop, zmień nazwy katalogów `%LOCALAPPDATA%\Dockerun` i `%LOCALAPPDATA%\docker-secrets-engine`, uruchom ponownie |
| Zajęty port 3000 lub 5173                                | zamknij poprzednie `npm start`                                          |
| `401` przy logowaniu na konto `recepcja`                 | do starego `backend/.env` dopisz `RECEPTION_LOGIN`, `RECEPTION_PASSWORD_HASH` i `SESSION_SECRET` z `backend/.env.example` |

### Jak frontend korzysta z API

- Adres bazowy: `http://localhost:3000/api/v1`. CORS dopuszcza `http://localhost:5173`.
- Pola, przykłady i kody błędów są w [docs/openapi.yaml](docs/openapi.yaml). Każdy błąd ma pola `code`, `message`
  i `details`.
- Żądania panelu recepcji wysyłaj z `credentials: 'include'`, bo sesja jest w ciasteczku.

| Gotowe endpointy                                                    | Historyjka           | Dostęp       |
| ------------------------------------------------------------------- | -------------------- | ------------ |
| `GET /offers`, `GET /availability`                                  | US-02, US-03, US-04  | publiczny    |
| `POST /portal/reservations`                                         | US-05                | publiczny    |
| `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`             | US-27                | recepcja     |
| `GET /rooms`                                                        | US-01                | recepcja     |
| `POST /reservations`, `POST /reservations/{id}/cancel`              | US-08, część US-10   | recepcja     |
| `GET /external/offers`, `GET /external/availability`                | US-21                | klucz API    |

## Struktura repozytorium

```text
.gitignore           pliki, które nie trafiają do repozytorium (np. .env)
.github/workflows/   CI frontendu i publikacja wersji demo na GitHub Pages
backend/             REST API (NestJS, Prisma)
docs/openapi.yaml    kontrakt API
frontend/            aplikacja React
scripts/             skrypty npm run setup i npm start
docker-compose.yml   lokalna baza PostgreSQL
README.md            ten plik
```

## Jak pracujemy

1. Weź kartę ze swojego sprintu na tablicy, przypisz się i ustaw status **In Progress**.
2. Załóż gałąź od aktualnego `develop`, np. `feat/us-05-portal-booking`.
3. Rób małe commity w formacie [Conventional Commits](https://www.conventionalcommits.org) po angielsku,
   np. `feat(portal): add booking form`.
4. Przed wysłaniem uruchom `npm run lint`, `npm test` i `npm run build`.
5. Otwórz Pull Request do `develop` i ustaw status **Code Review**. Scalamy po zielonej CI i przeglądzie innej osoby.
6. Tester sprawdza kryteria akceptacji (**QA / Tests**), a Product Owner akceptuje wynik (**AkceptPO**).
7. Na koniec sprintu `develop` trafia Pull Requestem do `main`, a Product Owner zamyka karty (**Done**).

| Gałąź                   | Do czego                                            | Jak trafiają zmiany              |
| ----------------------- | --------------------------------------------------- | -------------------------------- |
| `main`                  | wersja oddawana, publikowana jako demo              | Pull Request z `develop`         |
| `develop`               | wspólna wersja robocza                              | Pull Requesty z gałęzi roboczych |
| `feat/…`, `fix/…`       | jedna historyjka lub poprawka                       | commity autora                   |

Zasady:

- Do `main` i `develop` nie wypychamy zmian bezpośrednio, a kod, commity i nazwy gałęzi piszemy po angielsku.
- Haseł, kluczy i plików `.env` nie dodajemy do repozytorium. Dane testowe są zawsze fikcyjne.
- Kontrakt API zmieniamy tylko po uzgodnieniu z zespołami A, B i D.

## Zespół

| Osoba              | Rola                     |
| ------------------ | ------------------------ |
| Michał Nowak       | Analityk / Product Owner |
| Monika Grzegorczyk | Koordynator              |
| Damian Tchorzewski | Backend                  |
| Paweł Dowgiert     | Frontend                 |
| Karol Pietraszek   | Tester automatyzujący    |
| Daniel Klara       | Tester manualny          |

[docs]: https://vistulaedu-my.sharepoint.com/:w:/g/personal/dtchorz2_stu_vistula_edu_pl/IQACUA_yiw7GQp0b4R-p9sEfAeVJhzooCF4c7BvTB6N4dbk?e=UtV3fD
