using Fin.Domain.Finance.Entities;
using Fin.Infrastructure.Finance.Contexts;
using Fin.Infrastructure.Finance.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Fin.Infrastructure.Finance.Repositories
{
    public sealed class TranslationRepository : ITranslationRepository
    {
        private readonly FinanceContext _dbContext;

        public TranslationRepository(FinanceContext dbContext)
        {
            _dbContext = dbContext;
        }

        public async Task<List<Translation>> GetAllAsync(CancellationToken cancellationToken)
        {
            return await _dbContext.Translations.AsNoTracking().OrderBy(x => x.Source).ToListAsync(cancellationToken);
        }

        public async Task<List<Translation>> GetByHashesAsync(IReadOnlyCollection<string> hashes, CancellationToken cancellationToken)
        {
            return await _dbContext.Translations.Where(x => hashes.Contains(x.SourceHash)).ToListAsync(cancellationToken);
        }

        public void Add(Translation translation) => _dbContext.Translations.Add(translation);

        public void Remove(Translation translation) => _dbContext.Translations.Remove(translation);
    }
}
