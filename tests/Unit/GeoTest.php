<?php

namespace Tests\Unit;

use App\Services\Geo;
use PHPUnit\Framework\TestCase;

class GeoTest extends TestCase
{
    public function test_distance_of_one_thousandth_degree_latitude(): void
    {
        $this->assertEqualsWithDelta(111.19, Geo::distance([0, 0], [0.001, 0]), 0.05);
    }

    public function test_path_length_sums_segments(): void
    {
        $path = [[0, 0], [0.001, 0], [0.001, 0.001]];
        $this->assertEqualsWithDelta(222.39, Geo::pathLength($path), 0.1);
        $this->assertSame(0.0, Geo::pathLength([[0, 0]]));
    }
}
