-- M2: the dispatch capability must not inherit ordinary tenant table privileges. Worker login roles
-- are provisioned as direct members of both roles and select exactly one inside each short transaction.
REVOKE signalstack_runtime FROM signalstack_worker;
ALTER ROLE signalstack_worker NOINHERIT;
