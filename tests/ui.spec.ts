import { test, expect } from "@playwright/test";
test("honest unconfigured screen, registration, reset and mobile layout", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Вход" })).toBeVisible();
  await expect(
    page.getByText("Подключите Supabase", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Войти", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Зарегистрироваться", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Регистрация" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Юзернейм", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Вернуться ко входу" }).click();
  await page.getByRole("button", { name: "Забыли пароль?" }).click();
  await expect(
    page.getByRole("heading", { name: "Сброс пароля" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("keyboard navigation and reset error state", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Вход" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("textbox", { name: "Email", exact: true }),
  ).toBeFocused();
  await page.goto("/reset-password");
  await expect(
    page.getByRole("alert").filter({ hasText: "Supabase не подключён" }),
  ).toContainText("Supabase не подключён");
  await expect(
    page.getByRole("button", { name: "Сохранить пароль" }),
  ).toBeDisabled();
});
