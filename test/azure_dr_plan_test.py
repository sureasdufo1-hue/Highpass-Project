from datetime import datetime, timedelta, timezone
import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('azure_dr_plan', ROOT/'scripts/azure-dr-plan.py')
dr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dr)
NOW = datetime(2026, 10, 16, 8, tzinfo=timezone.utc)


def inventory():
    return {'subscription': dr.SUB, 'tenant': dr.TENANT, 'primaryRegion': 'japaneast',
            'allowedLocations': ['japaneast', 'eastasia', 'southeastasia'],
            'existingCidrs': ['10.89.0.0/16'], 'creditBalanceVerified': False,
            'regionalQuota': {'cores': {'current': 0, 'limit': 6},
                              'standardBasv2Family': {'current': 0, 'limit': 10}}}


class DrPlanTests(unittest.TestCase):
    def test_student_assigned_hostname_cannot_claim_dns_control(self):
        plan = dr.make_plan(inventory(), now=NOW)
        self.assertIn('CUSTOM_HTTPS_DNS_CONTROL_REQUIRED', plan['blockers'])
        self.assertFalse(plan['trafficManager']['dnsControlVerified'])

    def test_policy_blocks_japan_west_even_with_quota(self):
        plan = dr.make_plan(inventory(), region='japanwest', now=NOW)
        self.assertIn('REGION_DISALLOWED_BY_SUBSCRIPTION', plan['blockers'])

    def test_different_geography_must_not_restore_japan_vault_backup(self):
        plan = dr.make_plan(inventory(), now=NOW)
        self.assertIn('CROSS_GEOGRAPHY_KEY_RECOVERY_DECISION_REQUIRED', plan['blockers'])
        self.assertFalse(plan['keyRecovery']['backupRestoreAcrossGeographyAllowed'])

    def test_credit_and_lifecycle_never_claim_unperformed_actions(self):
        plan = dr.make_plan(inventory(), now=NOW)
        self.assertIn('REMAINING_STUDENT_CREDIT_NOT_VERIFIED', plan['blockers'])
        self.assertFalse(plan['resourcesCreated'])
        self.assertFalse(plan['demoWindow']['deallocationScheduled'])
        self.assertEqual(plan['demoWindow']['endKst'], '2026-10-20T23:59:00+09:00')

    def test_overlapping_network_blocks(self):
        value=inventory();value['existingCidrs'].append('10.91.0.0/16')
        self.assertIn('NETWORK_RANGE_COLLISION', dr.make_plan(value, now=NOW)['blockers'])

    def test_insufficient_quota_blocks(self):
        value=inventory();value['regionalQuota']['cores']['current']=5
        self.assertIn('REGIONAL_COMPUTE_QUOTA_NOT_VERIFIED', dr.make_plan(value, now=NOW)['blockers'])

    def test_primary_and_unreviewed_regions_are_rejected(self):
        for region in ['japaneast','unknown']:
            with self.subTest(region=region), self.assertRaises(ValueError):
                dr.make_plan(inventory(), region=region, now=NOW)

    def test_other_subscription_or_tenant_is_rejected(self):
        for key in ['subscription','tenant']:
            value=inventory();value[key]='other'
            with self.subTest(key=key), self.assertRaises(ValueError):dr.make_plan(value,now=NOW)

    def test_expired_window_blocks(self):
        self.assertIn('DEMO_WINDOW_EXPIRED',dr.make_plan(inventory(),now=NOW+timedelta(days=6))['blockers'])

    def test_unsafe_or_path_hosts_rejected(self):
        for host in ['http://example.com','https://user:password@example.com','https://example.com/mobile/',
                     'https://example.com:5432','https://example.com?token=x','127.0.0.1','localhost']:
            with self.subTest(host=host), self.assertRaises(ValueError):dr.canonical_host(host)

    def test_custom_host_is_only_candidate_not_verification(self):
        plan=dr.make_plan(inventory(),'https://demo.example.com/',now=NOW)
        self.assertNotIn('CUSTOM_HTTPS_DNS_CONTROL_REQUIRED',plan['blockers'])
        self.assertFalse(plan['trafficManager']['dnsControlVerified'])
        self.assertEqual(plan['trafficManager']['profileStatus'],'Disabled')

    def test_cost_is_only_compute_estimate(self):
        value=inventory();value['linuxHourlyUsd']=0.1
        cost=dr.make_plan(value,now=NOW)['cost']
        self.assertEqual(cost['computeOnlyUntilDeadlineUsd'],10.3)
        self.assertTrue(cost['notAFullQuote'])

    def test_naive_clock_rejected(self):
        with self.assertRaises(ValueError):dr.make_plan(inventory(),now=datetime(2026,10,16))

    def evidence(self):
        result={k:True for k in ['operatorApproved','primaryFenced','lastCommitReconciled',
                'consentRevocationsCurrent','qrConsumptionCurrent','replayLedgerCurrent',
                'auditIntegrityVerified','tlsVerified','keyAccessVerified','hospitalPathVerified','singleWriterLockHeld']}
        return {**result,'observedAt':NOW.isoformat(),'receivedLsn':'0/1ABC','replayedLsn':'0/1ABC'}

    def test_each_missing_promotion_condition_denies(self):
        evidence=self.evidence()
        for key,value in evidence.items():
            if value is True:
                changed={**evidence,key:False}
                with self.subTest(key=key):self.assertFalse(dr.promotion_preconditions(changed,NOW)['eligibleForSeparateOperatorProcedure'])

    def test_truthy_strings_do_not_authorize(self):
        evidence=self.evidence();evidence['operatorApproved']='true'
        self.assertFalse(dr.promotion_preconditions(evidence,NOW)['eligibleForSeparateOperatorProcedure'])

    def test_promotion_evaluator_rejects_naive_clock(self):
        with self.assertRaises(ValueError):
            dr.promotion_preconditions(self.evidence(), datetime(2026,10,16))

    def test_stale_future_or_missing_timestamp_denies(self):
        for observed in [(NOW-timedelta(seconds=61)).isoformat(),(NOW+timedelta(seconds=1)).isoformat(),None]:
            value=self.evidence();value['observedAt']=observed
            with self.subTest(observed=observed):self.assertFalse(dr.promotion_preconditions(value,NOW)['eligibleForSeparateOperatorProcedure'])

    def test_wal_not_replayed_denies(self):
        value=self.evidence();value['replayedLsn']='0/1ABB'
        self.assertFalse(dr.promotion_preconditions(value,NOW)['eligibleForSeparateOperatorProcedure'])

    def test_evaluator_does_not_promote_even_when_conditions_match(self):
        result=dr.promotion_preconditions(self.evidence(),NOW)
        self.assertTrue(result['eligibleForSeparateOperatorProcedure'])
        self.assertFalse(result['promotionExecuted'])

    def test_disabled_template_cannot_cut_over_dns(self):
        template=json.loads((ROOT/'infra/azure/dr-traffic-manager.candidate.json').read_text())
        self.assertEqual(len(template['resources']),1)
        p=template['resources'][0]['properties']
        self.assertEqual(p['profileStatus'],'Disabled')
        self.assertEqual(p['trafficRoutingMethod'],'Priority')
        self.assertEqual([e['properties']['priority'] for e in p['endpoints']],[1,2])
        self.assertTrue(all(e['properties']['endpointStatus']=='Disabled' for e in p['endpoints']))
        self.assertEqual(p['monitorConfig']['expectedStatusCodeRanges'],[{'min':200,'max':200}])


if __name__=='__main__':unittest.main()
