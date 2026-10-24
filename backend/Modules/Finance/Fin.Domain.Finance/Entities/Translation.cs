using System.Security.Cryptography;
using System.Text;

namespace Fin.Domain.Finance.Entities
{
    // One piece of interface text: the Vietnamese source as shown on screen and its German translation typed by the admin.
    // Numbers in the source are replaced by {0}, {1}… so "Trang 2 / 5" and "Trang 3 / 9" share one row.
    public sealed class Translation
    {
        public const int SourceMaxLength = 1000;
        public const int TextMaxLength = 2000;
        public const int DiscoverBatchMax = 300;

        // The source is too long for a unique index in MySQL (utf8mb4), so rows are keyed by its SHA-256.
        public string SourceHash { get; set; } = string.Empty;
        public string Source { get; set; } = string.Empty;
        public string? De { get; set; }
        // Text the admin chose not to translate (shop data picked up from the screen, brand names…); hidden from the list.
        public bool Ignored { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }

        public static string HashOf(string source) =>
            Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(source))).ToLowerInvariant();

        // Same rule as the frontend: trimmed, inner whitespace collapsed to one space.
        public static string Normalize(string? source) =>
            string.Join(' ', (source ?? string.Empty).Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
    }
}
