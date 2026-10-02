import { randomUUID } from 'crypto';
import { expect, test } from './fixture';

test.use({ storageState: { cookies: [], origins: [] } });

test('Sign up with invite link via email', async ({
  page,
  loginPage,
  leftMenu,
  membersSection,
  settingsPage,
  profileSection,
  confirmationModal,
}) => {
  const email = `test${randomUUID().replaceAll('-', '')}@apple.dev`;
  const firstName = 'John';
  const lastName = 'Doe';

  const inviteLink: string =
    await test.step('Go to Settings and copy invite link', async () => {
      await page.goto('/');
      await loginPage.clickLoginWithEmailIfVisible();
      await loginPage.typeEmail(process.env.DEFAULT_LOGIN);
      await loginPage.clickContinueButton();
      await loginPage.typePassword(process.env.DEFAULT_PASSWORD);
      await loginPage.clickSignInButton();

      const workspaceChooser = page.getByText('Choose a workspace');
      const companiesLanding = page.getByText('All Companies', {
        exact: false,
      });

      await expect(workspaceChooser.or(companiesLanding).first()).toBeVisible();

      if (await workspaceChooser.isVisible()) {
        await page.getByText('Apple', { exact: true }).click();
      }

      await expect(companiesLanding).toBeVisible();
      await leftMenu.goToSettings();
      await settingsPage.goToMembersSection();
      await membersSection.copyInviteLink();
      return await page.evaluate('navigator.clipboard.readText()');
    });

  await test.step('Go to invite link', async () => {
    await settingsPage.logout();
    await page.waitForURL('**/welcome');
    await page.goto(inviteLink);
    await expect(page.getByText(/Join .+ team/)).toBeVisible();
  });

  await test.step('Create new account', async () => {
    await loginPage.clickLoginWithEmailIfVisible();
    await loginPage.typeEmail(email);
    await loginPage.clickContinueButton();
    await loginPage.typePassword(process.env.DEFAULT_PASSWORD);
    await loginPage.clickSignUpButton();
    await loginPage.skipOptionalOnboardingStepsUntilCreateProfile();
    await expect(page.getByText('Create profile')).toBeVisible();
    await expect(page.getByPlaceholder('Head of Partnerships')).toBeVisible();
    await loginPage.typeFirstName(firstName);
    await loginPage.typeLastName(lastName);
    await loginPage.clickContinueButton();
  });

  await test.step('Delete account from workspace', async () => {
    await expect(page.getByTestId('workspace-dropdown')).toBeVisible();
    await leftMenu.goToSettings();
    await settingsPage.goToProfileSection();
    await profileSection.deleteAccount();
    await expect(page.getByText('Account Deletion')).toBeVisible();
    await confirmationModal.typePlaceholderToInput();
    await confirmationModal.clickConfirmButton();

    await page.waitForURL('**/welcome');
  });
});
