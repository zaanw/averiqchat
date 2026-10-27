import { test, expect } from "@playwright/test";
import configuration from "../config/supabase.public.json" with { type: "json" };
// Test-only service fixtures: never included in the product or sent to Supabase.
// These checks validate UI behavior, not real authentication or message delivery.
const me = "00000000-0000-4000-8000-000000000001",
  peer = "00000000-0000-4000-8000-000000000002";
const direct = "00000000-0000-4000-8000-000000000010",
  group = "00000000-0000-4000-8000-000000000011";
test("chat filters, mobile navigation, grouped messages, composer and theme", async ({
  page,
}, info) => {
  const profiles = [
    {
      id: me,
      username: "tester",
      display_name: "Тестовый профиль",
      avatar_path: null,
    },
    { id: peer, username: "alina", display_name: "Алина", avatar_path: null },
  ];
  const messages = [
    {
      id: crypto.randomUUID(),
      conversation_id: direct,
      sender_id: peer,
      body: "Привет!",
      reply_to: null,
      created_at: "2026-10-27T10:00:00Z",
      edited_at: null,
      deleted_at: null,
    },
    {
      id: crypto.randomUUID(),
      conversation_id: direct,
      sender_id: peer,
      body: "Как дела?",
      reply_to: null,
      created_at: "2026-10-27T10:01:00Z",
      edited_at: null,
      deleted_at: null,
    },
  ];
  const conversations = [
    {
      id: direct,
      kind: "direct",
      title: null,
      avatar_path: null,
      created_at: "2026-10-27T09:00:00Z",
      last_message: messages[1],
    },
    {
      id: group,
      kind: "group",
      title: "Команда",
      avatar_path: null,
      created_at: "2026-10-27T08:00:00Z",
      last_message: null,
    },
  ];
  const members = conversations.flatMap((c) =>
    [me, peer].map((user_id) => ({
      conversation_id: c.id,
      user_id,
      role: user_id === me ? "owner" : "member",
      last_read_at: "2026-10-27T09:00:00Z",
    })),
  );
  const now = Math.floor(Date.now() / 1000);
  const jwt = `e30.${Buffer.from(JSON.stringify({ sub: me, role: "authenticated", aud: "authenticated", exp: now + 3600, iat: now })).toString("base64url")}.test`;
  await page.addInitScript(
    ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
    {
      key: `sb-${new URL(configuration.url).hostname.split(".")[0]}-auth-token`,
      session: {
        access_token: jwt,
        refresh_token: "test-only",
        expires_at: now + 3600,
        expires_in: 3600,
        token_type: "bearer",
        user: {
          id: me,
          aud: "authenticated",
          role: "authenticated",
          email: "test@example.test",
          user_metadata: { username: "tester" },
          app_metadata: { provider: "email" },
          created_at: "2026-10-27T08:00:00Z",
        },
      },
    },
  );
  await page.context().routeWebSocket(/supabase\.co/, (ws) => ws.close());
  await page.context().route(`${configuration.url}/**`, async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname;
    let data: unknown = null;
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "content-type": "application/json",
    };
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    if (path.endsWith("/rpc/list_conversations")) data = conversations;
    else if (path.endsWith("/profiles"))
      data = url.searchParams.has("id") ? profiles[0] : profiles;
    else if (path.endsWith("/conversation_members")) data = members;
    else if (path.endsWith("/messages"))
      data = messages
        .filter(
          (m) =>
            `eq.${m.conversation_id}` ===
            url.searchParams.get("conversation_id"),
        )
        .slice()
        .reverse();
    else if (path.endsWith("/attachments") || path.endsWith("/blocks"))
      data = [];
    else if (path.endsWith("/rpc/mark_read")) data = null;
    else if (path.endsWith("/rpc/send_message")) {
      const payload = route.request().postDataJSON();
      messages.push({
        id: payload.client_id,
        conversation_id: payload.cid,
        sender_id: me,
        body: payload.content,
        reply_to: null,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
      });
      data = payload.client_id;
    } else {
      throw new Error(`Unexpected test request: ${path}`);
    }
    await route.fulfill({ status: 200, headers, body: JSON.stringify(data) });
  });
  await page.goto("/averiqchat/");
  await expect(page.locator(".conversation-item")).toHaveCount(2);
  await expect(page.getByLabel("Меню Averiq")).toBeVisible();
  await page.getByLabel("Меню Averiq").click();
  await expect(page.locator(".app-menu")).toHaveJSProperty("open", true);
  await page.getByRole("textbox", { name: "Фильтр чатов" }).click();
  await expect(page.locator(".app-menu")).toHaveJSProperty("open", false);
  await page.getByLabel("Меню Averiq").click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".app-menu")).toHaveJSProperty("open", false);
  await expect(page.getByLabel("Меню Averiq")).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Новый чат", exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Личные", exact: true }).click();
  await expect(page.locator(".conversation-item")).toHaveCount(1);
  await page.getByRole("button", { name: "Группы", exact: true }).click();
  await expect(page.locator(".conversation-item")).toHaveCount(1);
  await expect(page.locator(".conversation-item")).toContainText("Команда");
  await page.getByRole("button", { name: "Все", exact: true }).click();
  await page.getByRole("textbox", { name: "Фильтр чатов" }).fill("Алина");
  await expect(page.locator(".conversation-item")).toHaveCount(1);
  await page.locator(".conversation-item").click();
  await expect(
    page.getByRole("heading", { name: "Алина", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".message-row.grouped")).toHaveCount(1);
  const firstMessage = page.locator(".message-row").first();
  await firstMessage.getByLabel("Действия с сообщением").click();
  await firstMessage
    .getByRole("button", { name: "Ответить", exact: true })
    .click();
  await expect(page.locator(".reply-bar")).toContainText("Привет!");
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Сообщение", exact: true });
  const height = await input.evaluate((el) => el.clientHeight);
  await input.fill("Первая строка\nВторая строка\nТретья строка");
  expect(await input.evaluate((el) => el.clientHeight)).toBeGreaterThan(height);
  await page
    .getByRole("button", { name: "Отправить сообщение", exact: true })
    .click();
  await expect(page.getByRole("log")).toContainText("Третья строка");
  await expect(input).toHaveValue("");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("chat.png"),
    animations: "disabled",
  });
  if (info.project.name === "mobile") {
    await page.getByRole("button", { name: "Назад к чатам" }).click();
    await expect(
      page.getByRole("textbox", { name: "Фильтр чатов" }),
    ).toBeVisible();
  }
  await page.getByLabel("Меню Averiq").click();
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Чаты", exact: true })
    .click();
  await page.getByRole("button", { name: "Светлая тема", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Тёмная тема", exact: true }).click();
  await page.getByRole("button", { name: "Фиолетовый", exact: true }).click();
  await page.getByRole("slider").press("End");
  await expect(page.getByRole("slider")).toHaveValue("20");
  await page.getByLabel("Фон переписки").selectOption("plain");
  await page.getByRole("switch", { name: /Компактный список/ }).check();
  await page.getByLabel("Отправка сообщения").selectOption("mod-enter");
  await page
    .getByRole("switch", { name: /Показывать, что я печатаю/ })
    .uncheck();
  await expect(page.locator(".chat-app")).toHaveAttribute(
    "data-accent",
    "violet",
  );
  await expect(page.locator(".chat-app")).toHaveAttribute(
    "data-compact",
    "true",
  );
  await expect(page.locator(".chat-wallpaper")).toBeHidden();
  await page.screenshot({
    path: info.outputPath("settings.png"),
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Меню Averiq")).toBeFocused();
  const otherTab = await page.context().newPage();
  await otherTab.goto("/averiqchat/");
  await expect(otherTab.locator(".chat-app")).toHaveAttribute(
    "data-accent",
    "violet",
  );
  // Another account's preferences must not affect this account.
  await otherTab.evaluate(() =>
    localStorage.setItem(
      "averiq-chat-preferences:another-user",
      JSON.stringify({ accent: "green" }),
    ),
  );
  await expect(page.locator(".chat-app")).toHaveAttribute(
    "data-accent",
    "violet",
  );
  await otherTab.evaluate((id) => {
    const key = `averiq-chat-preferences:${id}`;
    const preferences = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(
      key,
      JSON.stringify({ ...preferences, accent: "green" }),
    );
  }, me);
  await expect(page.locator(".chat-app")).toHaveAttribute(
    "data-accent",
    "green",
  );
  await otherTab.close();
  await page.reload();
  await expect(page.locator(".chat-app")).toHaveAttribute(
    "data-compact",
    "true",
  );
  await expect(page.locator(".chat-app")).toHaveAttribute(
    "data-accent",
    "green",
  );
  await page.locator(".conversation-item").first().click();
  const composer = page.getByRole("textbox", {
    name: "Сообщение",
    exact: true,
  });
  await expect(page.locator(".bubble > p").first()).toHaveCSS(
    "font-size",
    "20px",
  );
  await composer.fill("Отправка сочетанием");
  await composer.press("Enter");
  await expect(composer).toHaveValue("Отправка сочетанием\n");
  await composer.press("Control+Enter");
  await expect(
    page.locator(".bubble").filter({ hasText: "Отправка сочетанием" }),
  ).toBeVisible();
  await expect(composer).toHaveValue("");
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "Назад к чатам" }).click();
  await page.getByLabel("Меню Averiq").click();
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Чаты", exact: true })
    .click();
  await expect(
    page.getByRole("switch", { name: /Показывать, что я печатаю/ }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Сбросить настройки чатов", exact: true })
    .click();
  await expect(page.locator(".chat-app")).toHaveAttribute(
    "data-accent",
    "blue",
  );
  await expect(page.getByRole("slider")).toHaveValue("15");
  await page.keyboard.press("Escape");
  conversations.splice(0);
  members.splice(0);
  messages.splice(0);
  await page.reload();
  await expect(page.locator(".empty-list")).toContainText(
    "У вас пока нет чатов",
  );
  if (info.project.name === "desktop") {
    await page.setViewportSize({ width: 1920, height: 960 });
    expect(
      await page
        .locator(".chat-app")
        .evaluate((element) => element.getBoundingClientRect().width),
    ).toBe(1920);
    await expect(
      page.getByRole("heading", { name: "Выберите чат", exact: true }),
    ).toBeVisible();
  }
  await page.screenshot({
    path: info.outputPath("empty.png"),
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Новый чат", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Новый чат", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
});
