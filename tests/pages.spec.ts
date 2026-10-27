import { test, expect } from "@playwright/test";
test("Pages export loads assets and nested auth routes under the repository path", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400)
      failures.push(`${response.status()} ${response.url()}`);
  });
  await page.goto("/averiqchat/");
  await expect(
    page.getByRole("heading", { name: "С возвращением" }),
  ).toBeVisible();
  expect(
    await page
      .locator("body")
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe("rgb(13, 16, 27)");
  await page
    .getByRole("button", { name: "Зарегистрироваться", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Давайте знакомиться" }),
  ).toBeVisible();
  await page.goto("/averiqchat/reset-password/");
  await expect(
    page.getByRole("heading", { name: "Новый пароль" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Вернуться ко входу" }).click();
  await expect(page).toHaveURL(/\/averiqchat\/$/);
  await page.goto("/averiqchat/auth/confirm/");
  await expect(page.getByRole("status")).toContainText("подключите Supabase");
  await page.getByRole("link", { name: "На страницу входа" }).click();
  await expect(
    page.getByRole("heading", { name: "С возвращением" }),
  ).toBeVisible();
  expect(failures).toEqual([]);
});
