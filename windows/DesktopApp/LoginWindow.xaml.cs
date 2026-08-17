using System;
using System.Windows;
using Cursors = System.Windows.Input.Cursors;

namespace MalmegaVille.Sentinel.Desktop;

public partial class LoginWindow : Window
{
    private readonly BackendApiClient _apiClient;

    public string? AuthToken { get; private set; }
    public string? AuthEmail { get; private set; }

    public LoginWindow(BackendApiClient apiClient)
    {
        InitializeComponent();
        _apiClient = apiClient;
    }

    private async void Login_Click(object sender, RoutedEventArgs e)
    {
        var email = EmailTextBox.Text.Trim();
        var password = PasswordInputBox.Password;

        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            ErrorText.Text = "Enter your email and password.";
            return;
        }

        ErrorText.Text = string.Empty;
        LoginButton.IsEnabled = false;
        Cursor = Cursors.Wait;

        try
        {
            var result = await _apiClient.LoginAsync(email, password);
            AuthToken = result.Token;
            AuthEmail = result.User.Email;
            DialogResult = true;
            Close();
        }
        catch (Exception ex)
        {
            ErrorText.Text = ex.Message;
        }
        finally
        {
            LoginButton.IsEnabled = true;
            Cursor = Cursors.Arrow;
        }
    }

    private void Cancel_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }
}
