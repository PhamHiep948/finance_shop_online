namespace Fin.Model.Dto.Finance.Responses
{
    // Months whose ad spend became a new expense, and months whose expense was updated to the new Etsy amount.
    public sealed class EtsyAdsSyncResponse
    {
        public EtsyAdsSyncResponse(int created, int updated)
        {
            Created = created;
            Updated = updated;
        }

        public int Created { get; }
        public int Updated { get; }
    }
}
