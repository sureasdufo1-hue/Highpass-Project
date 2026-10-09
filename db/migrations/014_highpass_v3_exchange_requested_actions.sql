-- Request intention only: never consent, AuthorizationDecision or TransferGrant.
-- Old rows retain empty/NOT CAPTURED intention; never infer VIEW or all actions.
CREATE FUNCTION highpass_v3.valid_exchange_actions(value text[]) RETURNS boolean
 LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT value IS NOT NULL AND cardinality(value) BETWEEN 0 AND 4 AND
 (cardinality(value)=0 OR (array_ndims(value)=1 AND array_lower(value,1)=1
  AND (SELECT count(*)=count(DISTINCT item) AND bool_and(item IS NOT NULL AND item IN
   ('study:view','study:download','study:pacs-transfer','study:mobile-export')) FROM unnest(value) AS item)))
$$;
ALTER TABLE highpass_v3.exchange_sessions ADD COLUMN requested_actions text[] NOT NULL DEFAULT '{}',
 ADD CONSTRAINT exchange_requested_actions_valid CHECK(highpass_v3.valid_exchange_actions(requested_actions) IS TRUE);
CREATE POLICY exchange_requested_actions_required ON highpass_v3.exchange_sessions AS RESTRICTIVE FOR INSERT
 WITH CHECK(cardinality(requested_actions) BETWEEN 1 AND 4);
REVOKE ALL ON FUNCTION highpass_v3.valid_exchange_actions(text[]) FROM PUBLIC;
