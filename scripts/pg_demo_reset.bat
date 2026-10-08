@echo off
REM =========================================================================
REM JLIN Motorparts - PostgreSQL Demo Database Reset Script
REM Supports resetting to an identical clean state before rehearsal / defense
REM =========================================================================

set PGHOST=localhost
set PGPORT=5432
set PGUSER=postgres
set PGDATABASE=jlin_demo_db
set DUMP_FILE=.\jlin_demo_clean.dump

echo =====================================================
echo  PostgreSQL Demo Reset: %PGDATABASE%
echo =====================================================

echo 1. Dropping existing database if exists...
dropdb -U %PGUSER% -h %PGHOST% -p %PGPORT% --if-exists %PGDATABASE%

echo 2. Creating clean baseline database...
createdb -U %PGUSER% -h %PGHOST% -p %PGPORT% %PGDATABASE%

if exist "%DUMP_FILE%" (
    echo 3. Restoring snapshot from %DUMP_FILE%...
    pg_restore -U %PGUSER% -h %PGHOST% -p %PGPORT% -d %PGDATABASE% -v "%DUMP_FILE%"
) else (
    echo 3. Running Knex migrations and demo seed...
    call npx knex migrate:latest --env pg_demo
    call npx knex seed:run --env pg_demo
    echo 4. Creating pre-defense baseline snapshot...
    pg_dump -U %PGUSER% -h %PGHOST% -p %PGPORT% -d %PGDATABASE% -F c -b -v -f "%DUMP_FILE%"
)

echo =====================================================
echo  PostgreSQL Reset Complete!
echo =====================================================
pause
