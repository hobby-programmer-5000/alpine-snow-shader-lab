# Alpine Photoreal Ski Race & Custom Shader Lab

실시간 WebGL2 / Three.js 기반 **제로-에셋(외부 3D 모델·오디오 0개) 실사 알파인 스키 레이스 & 커스텀 셰이더 랩**입니다. Google DeepMind 및 Google AI Studio의 몽블랑/샤모니 스키 데모에서 영감을 받아 클린룸으로 구현했으며, 최신 컴퓨터 그래픽스 논문(Max 1988, Losasso & Hoppe 2004, Mitchell 2007, Bruneton & Neyret 2008, Barré-Brisebois & Bouchard 2011, Lottes 2011, Barré-Brisebois 2014, Jimenez 2014, Yan et al. 2014, Schneider & Vos 2015, Narkowicz 2016, Hillaire 2020, Chermain et al. 2020)과 알파인 스키/눈사태 물리(Lind & Sanders 2004, Voellmy 1955)를 결합했습니다.

**바로 플레이하기: https://hobby-programmer-5000.github.io/alpine-snow-shader-lab/**

> 기본 모드는 `AI RACE`(20 Hz MPC AI 완주 관전)이며, 상단 `DRIVE (WASD)` 버튼으로 전환하면 직접 조작(`W/A/S/D` 카빙·턱·브레이크, `Space` 점프, `E` 폴 추진, `G` 눈사태 발동)으로 3개 스테이지를 주행할 수 있습니다.
> 상세 참고문헌 및 DOI/원문 링크는 [REFERENCES.md](./REFERENCES.md), 서드파티 오픈소스·데이터셋 고지는 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md), 비상업적 라이선스 전문은 [LICENSE](./LICENSE)를 참고하세요.

---

## 데모 영상 (Stage 1 · 한라산 `AI RACE`, `ULTRA ★`, 60 FPS 실기 녹화)

- [Stage 1 한라산 백록담 AI 레이스 완주 영상 (`media/stage1-hallasan-ai-race.mp4`)](./media/stage1-hallasan-ai-race.mp4) — `1280×720` H.264 MP4 (`31.4s`, `GOLD MEDAL 00:29.00`, `GATE 8/8`, `+0.0s`, 충돌 0회, 피니시 아치 중앙 오차 `-0.05m`)

---

## 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 `http://127.0.0.1:5179` 접속 (`npm run build`로 프로덕션 번들 빌드 가능).

---

## 핵심 기술 및 구현 내용

### 1. GPU 품질 프리셋 (`LOW` / `HIGH` / `ULTRA ★`) & 셰이더 랩
- **절차적 무이음 PBR 텍스처 아틀라스 (`src/core/proceduralPbrTextures.js`):** 외부 이미지 없이 런타임에 `512²` 이방성 사스트루기 노멀·캐비티 AO·빙하 얼음 노멀·화강암 노멀/균열 맵 및 스키어 원단/가죽/카본 노멀을 합성하여 다중 회전 스케일로 타일링 없이 적용
- **실사 설면 광학 & HDR 포스트 프로세싱 (`src/shaders/terrain.frag.glsl`, `src/shaders/bloomExtract.frag.glsl`, `src/shaders/bloomBlurV.frag.glsl`, `src/shaders/godRay.frag.glsl`, `src/shaders/postComposite.frag.glsl`, `src/core/postFxPipeline.js`):** 이동형 구름 그림자, 호라이즌 매핑(Max 1988) + 16스텝 FBO 트렌치 자체 그림자, 반투명 SSS(Barré-Brisebois & Bouchard 2011), 2레이어 다이아몬드 글린트(Yan et al. 2014; Chermain et al. 2020), HDR 블룸(Jimenez 2014), 래디얼 갓레이(Mitchell 2007), ACES 필믹 톤매핑(Narkowicz 2016), 4× MSAA + 5-탭 FXAA(Lottes 2011)
- **실제 한국 산악 DEM (`scripts/bake_korean_dem.py`, `src/core/demLoader.js`):** AWS Open Data / Mapzen Terrarium(USGS SRTM & GMTED2010) 고도 타일을 16비트 무손실 RG PNG + 3방향 호라이즌 맵으로 베이킹해 **한라산 백록담**과 **설악산 공룡능선** 실지형 구현

### 2. 3-Stage 스키 경기 코스 & Voellmy 상부 추격 눈사태
- **`STAGE 1 · 한라산` (`09:00 CRISP`):** 한라산 백록담 Real DEM · 8개 슬라롬 기문 · 3개 키커 · 빙판 2구간 · 화산암 바위 → **체크무늬 FINISH 아치**
- **`STAGE 2 · 설악산` (`15:30 ALPINE`):** 설악산 공룡능선 Real DEM · 10개 기문 · 빙판 4구간 · 점프형 크레바스 2개 · 화이트아웃 돌풍 · 중반 눈사태 추격 → **FINISH 아치**
- **`STAGE 3 · 파이널` (`17:45 SUNSET`):** 절차적 일몰 알파인 협곡 · 12개 슈퍼-G 기문 · 28% 지점 **슬랩 눈사태 추격전** · 강횡풍 · 크레바스 3개 → **FINISH 아치**
- **물리적 의미가 있는 상부 추격 슬랩 눈사태 (`src/core/avalancheSystem.js`):** 스키어 후방 상부에서 균열이 터져 경사각 연동 Voellmy 속도(`63~73 km/h`)로 추격하며, 따라잡히면 강력한 항력·횡방향 밀림·`+3.0s` 페널티가 적용되고 풀 턱이나 측면 회피로 따돌리면 `+500` 생존 보너스를 획득

### 3. 120 Hz 스키 물리 · 전신 생체역학 · 20 Hz MPC 월드컵 AI 레이서
- **120 Hz 뉴턴 스키 물리 & 강체 충돌 (`src/core/skierController.js`):** 경사면 중력($g\sin\theta$), 설면 운동마찰($\mu g\cos\theta$), 턱 자세 연동 공기저항($\frac{1}{2}\rho C_d A v^2$), 포물선 사이드컷 카빙($R = R_{sc}\cos\phi$) vs 엣지 슬립(`SLIP`), 코스 바위·근거리 나무 240그루·측면 바위 140개·세락 36개에 대한 120 Hz 무조건 강체 충돌 밀어내기 & 비탄성 반발 + 키커 램프 실표면 주행
- **전신 생체역학 & 클로즈업 스컬프팅 (`src/geometry/proceduralSkis.js`):** 저속 V-스케이팅 발 밀기 + 양팔 더블폴링 추진(V자 트랙 & 폴대 자국 FBO 각인), 턴 전환 안쪽 손목 폴 플랜트 & 다운 언웨이팅, 안쪽 스키 리드 & 힙 앵귤레이션, 점프 착지 무릎 충격 흡수, `POV`/`MACRO` 근접 시점용 해부학적 스컬프팅 스키어(4버클 부츠, 미러 고글, 5지 장갑, 에어백 팩)
- **실시간 20 Hz MPC 전방 궤적 AI 레이서 (`src/core/skierController.js`):** `2.1초`(~`40m`) 전방의 2단계 뉴턴 카빙 궤적 후보를 매 50ms마다 시뮬레이션해 바위·나무·세락 무충돌 회피, 2-게이트 연속 체이닝, 속도 적응형 크레바스 자동 점프, 눈사태 풀 턱 탈출, 곡선 코스 추종 피니시 아치 정중앙 정렬을 실시간 최적화

### 4. 제로-에셋 프로시저럴 3D 환경 오브젝트
- **한국 구상나무 눈꽃/상고대 & 알파인 침엽수림 (`src/geometry/proceduralSpruce.js`, `src/shaders/spruce.frag.glsl`):** 산악별 수종 특화(한라산 구상나무 상고대, 설악산 분비나무, 알파인 가문비나무) 15단 눈 덮인 층상 수관(2-LOD 총 720그루) + 지면 접촉 그림자
- **스무스 트라이플래너 화강암·8기둥 빙하 세락·지형 정합 장애물 (`src/geometry/proceduralBoulders.js`, `src/core/courseManager.js`):** 스무스 인덱스드 지오메트리 + 2옥타브 트라이플래너 노멀 매핑, 지형 정합 키커·빙판·3D 패럴랙스 크레바스·FIS 눈 염료 게이트 라인
- **대기 설연 & 알파인 랜드마크 (`src/geometry/atmosphericSnowFX.js`, `src/geometry/alpineLandmarks.js`):** 2,600개 GPU 눈송이/다이아몬드 더스트, 18개 능선 설연, 왕복 케이블카 곤돌라 2대, 산정 전망대, 안전 폴대 36개

---

## 라이선스 및 고지

- **License:** [PolyForm Noncommercial License 1.0.0](./LICENSE) — **상업적 이용 불가 (Noncommercial Use Only)** (연구, 학습, 개인/비영리 목적 사용·수정·배포 허용)
- **Third-Party Notices:** [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)
- **References:** [REFERENCES.md](./REFERENCES.md)
