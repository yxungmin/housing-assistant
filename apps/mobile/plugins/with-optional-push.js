/**
 * 개인 Apple 팀에서는 푸시 알림을 서명할 수 없다.
 *
 *   Personal development teams … do not support the Push Notifications capability.
 *   Entitlements file defines the value "aps-environment" which is not registered …
 *
 * expo-notifications가 `aps-environment`를 넣는데, 유료 Apple Developer 계정($99/년)이
 * 없으면 그 자리에서 빌드가 막힌다. ios/는 git에 없고 prebuild가 통째로 다시 만드니
 * 손으로 지워 봐야 다음 번에 또 생긴다 — 그래서 설정으로 박는다.
 *
 * 계정을 등록하면 `EXPO_IOS_PUSH=1`을 주고 빌드한다. 그러면 이 플러그인은 아무것도 하지 않는다.
 * 실수로 빼먹어도 잃는 것은 푸시뿐이고, 켜야 할 때 안 켜지면 바로 눈에 띈다 —
 * 반대로 기본값을 "켬"으로 두면 계정이 없는 동안 빌드가 통째로 막힌다.
 */
const { withEntitlementsPlist } = require("expo/config-plugins");

module.exports = function withOptionalPush(config) {
  if (process.env.EXPO_IOS_PUSH === "1") return config;
  return withEntitlementsPlist(config, (c) => {
    delete c.modResults["aps-environment"];
    return c;
  });
};
