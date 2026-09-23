import { useEffect, useState } from "react";
import { PRICE_KRW, priceParts } from "@/lib/billing";
import { readStorePrice, storeBillingConfigured } from "@/lib/billing-store";

/**
 * 화면에 적을 가격 (billing.ts의 priceParts). 스토어 가격을 앱이 켜진 동안 한 번만 묻는다.
 * 묻는 동안·못 받으면 PRICE_KRW로 적는다. 목(키 없음)에서는 묻지 않는다.
 */
type Parts = ReturnType<typeof priceParts>;
let cached: Parts | null = null;
let pending: Promise<Parts | null> | null = null;

function load(): Promise<Parts | null> {
  pending ??= readStorePrice().then((p) => {
    if (!p) return null;
    // 약관(terms.ts)은 PRICE_KRW로 적혀 있다. 스토어에 다른 가격으로 등록하면 약관도 같이 고쳐야 한다.
    if (__DEV__ && p.currencyCode === "KRW" && Math.round(p.price) !== PRICE_KRW) {
      console.warn(`스토어 가격 ${p.price}원이 약관·billing.ts의 ${PRICE_KRW}원과 다르다`);
    }
    cached = priceParts(p);
    return cached;
  });
  return pending;
}

export function usePrice(): Parts {
  const [parts, setParts] = useState<Parts>(cached ?? priceParts());
  useEffect(() => {
    if (cached || !storeBillingConfigured) return;
    let alive = true;
    void load().then((p) => alive && p && setParts(p));
    return () => {
      alive = false;
    };
  }, []);
  return parts;
}
