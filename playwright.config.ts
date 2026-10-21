import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',timeout:45000,expect:{timeout:15000},fullyParallel:true,workers:1,
  reporter:[['list']],use:{baseURL:'http://127.0.0.1:4178',trace:'retain-on-failure'},
  webServer:{command:'pnpm preview',url:'http://127.0.0.1:4178',reuseExistingServer:!process.env.CI,timeout:45000},
  projects:[
    {name:'chromium',testIgnore:'accessibility.spec.ts',use:{...devices['Desktop Chrome']}},
    {name:'firefox',testIgnore:'accessibility.spec.ts',use:{...devices['Desktop Firefox']}},
    {name:'webkit-desktop',testIgnore:'accessibility.spec.ts',use:{...devices['Desktop Safari']}},
    {name:'webkit-iphone',testIgnore:'accessibility.spec.ts',use:{...devices['iPhone 13']}},
    {name:'webkit-ipad',testIgnore:'accessibility.spec.ts',use:{...devices['iPad (gen 7)']}},
    {name:'android-phone',testIgnore:'accessibility.spec.ts',use:{...devices['Pixel 5']}},
    {name:'chromium-tablet',testIgnore:'accessibility.spec.ts',use:{browserName:'chromium',viewport:{width:820,height:1180},hasTouch:true,isMobile:true}},
    {name:'accessibility',testMatch:'accessibility.spec.ts',use:{...devices['Desktop Chrome'],bypassCSP:true}}
  ]
});
