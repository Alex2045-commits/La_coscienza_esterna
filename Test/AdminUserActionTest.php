<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class AdminUserActionTest extends TestCase {

    private string $adminToken;

    protected function setUp(): void {
        $this->adminToken = getenv('TEST_ADMIN_JWT');
        $this->assertNotEmpty($this->adminToken);
    }

    public function test_admin_cannot_delete_self(): void {

        $payload = json_encode([
            'action' => 'delete',
            'id' => 1
        ]);

        $context = stream_context_create([
            'http' => [
                'method'  => 'POST',
                'header'  =>
                    "Content-Type: application/json\r\n" .
                    "Authorization: Bearer {$this->adminToken}\r\n",
                'content' => $payload
            ]
        ]);

        $response = file_get_contents(
            'http://localhost/admin/admin_user_action.php',
            false,
            $context
        );

        $json = json_decode($response, true);

        $this->assertEquals(
            'CANNOT_MODIFY_SELF',
            $json['error'] ?? null
        );
    }
}
?>